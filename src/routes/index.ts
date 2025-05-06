import { Router } from "express";
import { createApp } from "../public/javascripts/vue-app.js";
import { renderToString } from "vue/server-renderer";

import { updateGtfsRealtime, openDb, getStops } from "gtfs";
import { RWLock } from "../lib/lock.js";

const router = Router();

const GTFS_CONFIG = {
  sqlitePath: "D:\\projects\\qr-departureboard\\dist\\gtfs.db",
  agencies: [
    {
      url: "https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip",
      realtimeAlerts: {
        url: "https://gtfsrt.api.translink.com.au/api/realtime/SEQ/alerts"
      },
      realtimeTripUpdates: {
        url: "https://gtfsrt.api.translink.com.au/api/realtime/SEQ/TripUpdates"
      },
      realtimeVehiclePositions: {
        url: "https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions"
      }
    }
  ],
  gtfsRealtimeExpierationSeconds: 120,
  verbose: false
};

const db = openDb(GTFS_CONFIG);

function getStationName(station: string): string {
  return getStops({ stop_id: station }, ["stop_name"])[0].stop_name ?? "";
}

export interface TripData {
    trip_headsign: string;
    platform_code: string;
    departure_timestamp: string;
    schedule_relationship: string;
    route_color: string;
    route_text_color: string;
    trip_id: string;
}

export interface AppState {
  tripData: TripData[];
  currentTime: Date;
  stationName: string;
}

const dataLock = new RWLock();
const MAX_DATA_AGE_MS = 10000;
let lastDataTime = 0;

async function getData(station: string): Promise<TripData[]> {
  const now = Date.now();

  if ((now - lastDataTime) > MAX_DATA_AGE_MS) {
    await dataLock.writeAcquire();

    try {
      await updateGtfsRealtime(GTFS_CONFIG);

      lastDataTime = now;
    } finally {
      dataLock.writeRelease();
    }
  }

  await dataLock.readAcquire();

  try {
    return db.prepare(`SELECT
        "t"."trip_id",
        "t"."trip_headsign",
        "s"."platform_code",
        "stu"."departure_timestamp",
        "stu"."schedule_relationship",
        "r"."route_color",
        "r"."route_text_color"
      FROM "stop_time_updates" "stu"
      INNER JOIN "stops" "s" ON
        "s"."stop_id" = "stu"."stop_id"
      INNER JOIN "routes" "r" ON
        "r"."route_id" = "stu"."route_id"
      INNER JOIN "trips" "t" ON
        "t"."trip_id" = "stu"."trip_id"
      WHERE
        (
          "s"."parent_station" = $station
          OR "s"."stop_id" = $station
        )
        AND "stu"."departure_timestamp" > (strftime('%s', 'now') - 60)
      ORDER BY "stu"."departure_timestamp" ASC
      LIMIT 8`).all({
        station
      });
  } finally {
    dataLock.readRelease();
  }
}

router.get("/:station", async (req, res, next) => {
    const stationName = await getStationName(req.params.station);

    const state = {
      station: req.params.station,
      currentTime: new Date(),
      tripData: await getData(req.params.station),
      stationName
    };

    const app = createApp(state);
    const vueData = await renderToString(app);

    res.render("index", {
        vueData,
        initialState: JSON.stringify(state)
    });
});

router.get("/status/:station", async (req, res, next) => {
    res.json(await getData(req.params.station));
});

export default router;
