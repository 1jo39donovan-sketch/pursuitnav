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

// The crew's service, chosen first on Session: it decides which vehicles are
// offered, and whether Pursuit and the Met's BCUs are shown.
export const SERVICES = [
  { id: "police", label: "Police", vehicles: ["car", "suv", "van", "carrier"] },
  { id: "ambulance", label: "Ambulance", vehicles: ["car", "ambulance"] },
  { id: "fire", label: "Fire", vehicles: ["car", "fire"] },
  { id: "other", label: "Other", vehicles: ["car", "suv", "van"] },
] as const satisfies readonly { id: string; label: string; vehicles: readonly VehicleType[] }[];

export type ServiceType = (typeof SERVICES)[number]["id"];

export const isService = (s: string | null | undefined): s is ServiceType => SERVICES.some((x) => x.id === s);

/** The vehicles to offer: the service's, or every vehicle before a service is chosen. */
export function vehiclesFor(service: ServiceType | null): readonly VehicleType[] {
  return service ? SERVICES.find((s) => s.id === service)!.vehicles : VEHICLES.map((v) => v.id);
}

export const isVehicle = (v: string | null | undefined): v is VehicleType => VEHICLES.some((x) => x.id === v);

export const vehicleLabel = (v: VehicleType) => VEHICLES.find((x) => x.id === v)!.label;
