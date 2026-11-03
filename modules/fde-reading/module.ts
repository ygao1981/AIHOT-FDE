import { defineModule } from "@aihot/contracts/modules";
export const fdeReadingModule = defineModule({
  name: "fde-reading",
  pages: [{ path: "reading", file: "routes/reading.tsx" }],
});
