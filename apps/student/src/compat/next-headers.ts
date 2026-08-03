type CookieValue = {
  name: string;
  value: string;
};

type CookieStore = {
  get(name: string): CookieValue | undefined;
  getAll(): CookieValue[];
  has(name: string): boolean;
  set(
    name: string,
    value: string,
    options?: Record<string, unknown>,
  ): void;
  delete(name: string): void;
};

function emptyCookieStore(): CookieStore {
  return {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  };
}

export async function cookies(): Promise<CookieStore> {
  return emptyCookieStore();
}

export async function headers(): Promise<Headers> {
  return new Headers();
}
