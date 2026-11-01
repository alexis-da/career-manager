import type { ReactNode } from "react";
import { Panel } from "../../_components/panel";

type StandingsCardProps = {
  title: string;
  divisions?: ReactNode; // the switch between a country's divisions, on the title's line
  children: ReactNode;
};

/** The card of a table: its title, then the table, one level of card whatever the tabs inside. */
export function StandingsCard({ title, divisions, children }: StandingsCardProps) {
  return (
    <Panel className="space-y-3 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="font-heading text-2xl leading-tight sm:text-[1.75rem]">{title}</h2>
        {divisions}
      </div>
      {children}
    </Panel>
  );
}
