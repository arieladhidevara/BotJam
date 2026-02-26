"use client";

import HydraStage from "@/components/HydraStage";

type LegacyTidalStageProps = {
  code: string;
  atMs: number;
};

export default function TidalStage(props: LegacyTidalStageProps) {
  return <HydraStage {...props} />;
}
