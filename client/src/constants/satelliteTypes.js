export const SAT_TYPE_CONFIG = [
  {
    id: "PAYLOAD",
    label: "Satellites",
    shortLabel: "SAT",
    desc: "Operational payloads and mission spacecraft",
  },
  {
    id: "ROCKET BODY",
    label: "Rocket Bodies",
    shortLabel: "R/B",
    desc: "Spent stages and launch vehicle hardware",
  },
  {
    id: "DEBRIS",
    label: "Debris",
    shortLabel: "DEB",
    desc: "Tracked breakup fragments and debris objects",
  },
  {
    id: "OTHER",
    label: "Other",
    shortLabel: "UNK",
    desc: "Unclassified or uncategorized objects",
  },
];

export function createSatTypeState() {
  return SAT_TYPE_CONFIG.reduce((state, item) => {
    state[item.id] = false;
    return state;
  }, {});
}
