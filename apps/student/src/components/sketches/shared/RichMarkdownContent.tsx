"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import SharedRichMarkdownContent from "@zoeskoul/learner-workspace/sketches/shared/RichMarkdownContent";
import {
  SketchImageRuntimeProvider,
  type SketchImageTranslationKey,
} from "@zoeskoul/learner-workspace/sketches/runtime/SketchImageRuntime";

type Props =
  React.ComponentProps<
    typeof SharedRichMarkdownContent
  >;

export default function RichMarkdownContent(
  props: Props,
) {
  const t =
    useTranslations(
      "imageSketchUi",
    );

  return (
    <SketchImageRuntimeProvider
      ImageComponent={Image}
      translate={(
        key: SketchImageTranslationKey,
      ) => t(key)}
    >
      <SharedRichMarkdownContent
        {...props}
        emptyFallback={
          props.emptyFallback
          ?? (
            <span className="opacity-60">
              {t("noText")}
            </span>
          )
        }
      />
    </SketchImageRuntimeProvider>
  );
}
