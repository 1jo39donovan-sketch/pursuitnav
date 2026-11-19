// Who needs the phone to keep driving directions going with the screen off
// (navigation, pursuit). The first to ask starts it, the last to let go stops
// it, one change at a time so a quick stop-then-start can't cross over.

export interface DrivingService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function drivingHolds(service: DrivingService) {
  const holders = new Set<string>();
  let running = false;
  let queue: Promise<void> = Promise.resolve();

  const settle = () => {
    queue = queue.then(async () => {
      const want = holders.size > 0;
      if (want === running) return;
      try {
        await (want ? service.start() : service.stop());
        running = want;
      } catch {
        // Not allowed just now (Android won't start one from the background,
        // or location is off): the screen-on lock still holds while open.
      }
    });
    return queue;
  };

  return {
    hold(who: string) {
      holders.add(who);
      return settle();
    },
    release(who: string) {
      holders.delete(who);
      return settle();
    },
    get running() {
      return running;
    },
  };
}
