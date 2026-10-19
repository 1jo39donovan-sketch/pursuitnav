// What the officer is driving. Routes avoid low bridges, narrow roads and
// weight limits it can't take. Sizes are on the server (server/src/costing.ts).

export const VEHICLES = [
  { id: "car", label: "Car", detail: "Response car, IRV" },
  { id: "suv", label: "SUV", detail: "Large car, 4x4" },
  { id: "van", label: "Van", detail: "Up to 3.5 t, about 2.6 m high" },
  { id: "carrier", label: "Carrier", detail: "Personnel carrier, about 3 m high" },
  { id: "ambulance", label: "Ambulance", detail: "Box-body ambulance, 5 t" },
  { id: "fire", label: "Fire appliance", detail: "Pump or rescue, 16 t" },
] as const;

export type VehicleType = (typeof VEHICLES)[number]["id"];

export const isVehicle = (v: string | null | undefined): v is VehicleType => VEHICLES.some((x) => x.id === v);

export const vehicleLabel = (v: VehicleType) => VEHICLES.find((x) => x.id === v)!.label;
