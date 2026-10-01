"use client";

import {
  createContext,
  useContext,
  type ElementType,
  type ReactNode,
} from "react";

export type SketchImageTranslationKey =
  | "imageViewer"
  | "dragToPan"
  | "wheelToZoom"
  | "doubleClickToReset"
  | "zoomOut"
  | "zoomIn"
  | "resetView"
  | "reset"
  | "marker"
  | "drag"
  | "panOff"
  | "wheel"
  | "zoomOff"
  | "noText";

export type SketchImageRuntimeValue = {
  ImageComponent: ElementType;
  translate: (
    key: SketchImageTranslationKey,
  ) => string;
};

const SketchImageRuntimeContext =
  createContext<SketchImageRuntimeValue | null>(
    null,
  );

export function SketchImageRuntimeProvider({
  ImageComponent,
  translate,
  children,
}: {
  ImageComponent: ElementType;
  translate: SketchImageRuntimeValue["translate"];
  children: ReactNode;
}) {
  return (
    <SketchImageRuntimeContext.Provider
      value={{
        ImageComponent,
        translate,
      }}
    >
      {children}
    </SketchImageRuntimeContext.Provider>
  );
}

export function useSketchImageRuntime(): SketchImageRuntimeValue {
  const value =
    useContext(
      SketchImageRuntimeContext,
    );

  if (!value) {
    throw new Error(
      "Shared sketch image rendering requires SketchImageRuntimeProvider",
    );
  }

  return value;
}

export function useSketchImageTranslation() {
  return useSketchImageRuntime().translate;
}

export function SketchImage(
  props: Record<string, any>,
) {
  const {
    ImageComponent,
  } = useSketchImageRuntime();

  return (
    <ImageComponent
      {...props}
    />
  );
}
