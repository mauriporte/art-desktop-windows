// house.json (~/.config/art-desktop, no secrets): what this house has. Loaded once before the page draws.
export let house = {}
export async function loadHouse() { house = (await window.art?.house?.()) ?? {} }
