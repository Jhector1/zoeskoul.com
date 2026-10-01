"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import SharedImageSketchComponent from "@zoeskoul/learner-workspace/sketches/components/ImageSketchComponent";
import {
  SketchImageRuntimeProvider,
  type SketchImageTranslationKey,
} from "@zoeskoul/learner-workspace/sketches/runtime/SketchImageRuntime";

type Props =
  React.ComponentProps<
    typeof SharedImageSketchComponent
  >;

export default function ImageSketchComponent(
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
      <SharedImageSketchComponent
        {...props}
      />
    </SketchImageRuntimeProvider>
  );
}
