import {
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";
import { redirect } from "next/navigation";

export default function CurriculumDraftCompatibilityPage() {
  const adminOrigin =
    process.env.NODE_ENV === "development"
      ? getLocalAppOrigin("admin")
      : getProductionAppOrigin("admin");

  redirect(new URL("/curriculum", adminOrigin).toString());
}
