import { defineWebModule } from "@aihot/web/modules";
import { IconDoc } from "../../apps/web/app/components/icons.tsx";

export const fdeReadingWeb = defineWebModule({
  name: "fde-reading",
  sidebar: { section: "内容", items: [{ to: "/reading", label: "阅读起点", icon: IconDoc }] },
  tools: [{ to: "/reading", label: "阅读起点", icon: <IconDoc size={20} /> }],
});
