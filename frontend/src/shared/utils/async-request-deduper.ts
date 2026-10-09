export type InFlightRequest<T> = { current: Promise<T> | null };

export function dedupeAsyncRequest<T>(state: InFlightRequest<T>, factory: () => Promise<T>): Promise<T> {
  if (state.current) return state.current;

  const request = Promise.resolve().then(factory);
  state.current = request;
  const clear = () => {
    if (state.current === request) state.current = null;
  };
  void request.then(clear, clear);
  return request;
}
