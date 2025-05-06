import { createApp } from "./vue-app.js";

async function getData(station: string) {
    const response = await fetch(`/status/${station}`);

    return await response.json();
}

createApp(getData).mount("#container");
