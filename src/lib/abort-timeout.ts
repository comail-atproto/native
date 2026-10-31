/** React Native's AbortSignal has no static timeout method. Keep the deadline
 * alive through response-body reads, just like AbortSignal.timeout on the web. */
export function abortAfter(milliseconds: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}
