export function createSignal<Value>() {
  const subscriptions = new Set<{ listener: (value: Value) => void }>();

  return {
    subscribe(listener: (value: Value) => void) {
      const subscription = { listener };
      subscriptions.add(subscription);

      return () => { subscriptions.delete(subscription); };
    },
    publish(value: Value) {
      for (const subscription of [...subscriptions]) {
        if (subscriptions.has(subscription)) subscription.listener(value);
      }
    },
  };
}
