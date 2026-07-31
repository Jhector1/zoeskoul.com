import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from "react";

type LoadedComponent<Props> =
  | ComponentType<Props>
  | {
      default: ComponentType<Props>;
    };

type DynamicLoader<Props> =
  () => Promise<LoadedComponent<Props>>;

type LoadingProps = {
  error?: Error | null;
  isLoading?: boolean;
  pastDelay?: boolean;
  timedOut?: boolean;
  retry?: () => void;
};

type DynamicOptions = {
  ssr?: boolean;
  loading?: ComponentType<LoadingProps>;
};

export default function dynamic<Props extends object = object>(
  loader: DynamicLoader<Props>,
  options: DynamicOptions = {},
): ComponentType<Props> {
  const LazyComponent: LazyExoticComponent<
    ComponentType<Props>
  > = lazy(async () => {
    const loaded = await loader();

    if (
      loaded &&
      typeof loaded === "object" &&
      "default" in loaded
    ) {
      return {
        default: loaded.default,
      };
    }

    return {
      default: loaded as ComponentType<Props>,
    };
  });

  const Loading = options.loading;

  function DynamicComponent(props: Props) {
    return (
      <Suspense
        fallback={
          Loading ? (
            <Loading
              isLoading
              error={null}
              pastDelay={false}
              timedOut={false}
            />
          ) : null
        }
      >
        <LazyComponent {...props} />
      </Suspense>
    );
  }

  DynamicComponent.displayName = "ViteDynamicComponent";
  return DynamicComponent;
}
