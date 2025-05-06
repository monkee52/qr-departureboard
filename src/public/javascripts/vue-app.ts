import { createSSRApp } from "vue";
import type { TripData, AppState } from "../../routes/index.js";

type GlobalWithState = Window & typeof globalThis & { __INITIAL_STATE__?: { tripData: TripData[], stationName: string } };

function formatTime(t: Date, includeSeconds: boolean): string {
    t = new Date(t);

    const hours = t.getHours() % 12;
    const minutes = t.getMinutes();

    const hourPart = (hours === 0 ? 12 : hours).toString();
    const minutesPart = minutes < 10 ? `0${minutes}` : minutes.toString();

    if (!includeSeconds) {
        return `${hourPart}:${minutesPart}`
    }

    const seconds = t.getSeconds();
    const secondsPart = seconds < 10 ? `0${seconds}` : seconds.toString();

    return `${hourPart}:${minutesPart}:${secondsPart}`
}

export function createApp(stateOrGetDataFunction: AppState | ((station: string) => AppState | Promise<AppState>)) {
    const app = createSSRApp({
        data: () => (typeof stateOrGetDataFunction === "function" ? ((globalThis as GlobalWithState)?.__INITIAL_STATE__!) : stateOrGetDataFunction),
        template: `<header>
<span class="time">{{ formatCurrentTime(currentTime) }}</span>
<h1>{{ stripStation(stationName) }}</h1>
</header>
<table class="trips">
    <thead>
        <tr>
            <th>Service</th>
            <th></th>
            <th>Platform</th>
            <th>Departs</th>
        </tr>
    </thead>
    <tbody>
        <tr class="trip" v-for="trip of tripData" :key="trip.key" :style="{ 'background-color': '#' + trip.route_color, 'color': '#' + trip.route_text_color }">
            <td>{{ getDepartureTime(trip) }}</td>
            <td class="name">{{ stripStation(trip.trip_headsign) }}</td>
            <td class="platform">{{trip.platform_code}}</td>
            <td>{{ getDepartureTimeRelative(trip) }}</td>
        </tr>
    </tbody>
</table>`,
        mounted() {
            this.getTripData();
        },

        methods: {
            async getTripData() {
                if (typeof stateOrGetDataFunction === "function") {
                    this.tripData = await stateOrGetDataFunction(this.station);

                    if (typeof window !== "undefined") {
                        setTimeout(() => {
                            this.getTripData();
                        }, 1000);

                        setInterval(() => {
                            this.currentTime = new Date();
                        }, 500);
                    }
                }
            },
            formatCurrentTime(t: Date): string {
                return formatTime(t, true);
            },
            getDepartureTime(trip: TripData): string {
                return formatTime(new Date(parseInt(trip.departure_timestamp, 10) * 1000), false);
            },
            getDepartureTimeRelative(trip: TripData): string {
                const now = Date.now();
                const departureTime = parseInt(trip.departure_timestamp, 10) * 1000
        
                const minutes = Math.max(0, Math.round((departureTime - now) / 60000));

                return `${minutes} min`;
            },
            stripStation(headsign: string): string {
                return headsign.replace(/(?<!\Wbus)\s+station\s*$/i, "").trim();
            }
        }
    });

    return app;
}
