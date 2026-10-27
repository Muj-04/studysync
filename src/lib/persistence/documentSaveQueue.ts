/** Debounce per document/key and serialize writes so an older response cannot win. */
export function createDocumentSaveQueue(onError: (error: unknown) => void, delay = 600) {
  type Job = { documentId: string; timer?: ReturnType<typeof setTimeout> };
  const jobs = new Map<string, Job>();
  const tails = new Map<string, Promise<void>>();
  const cancel = (key: string, job: Job) => {
    clearTimeout(job.timer);
    jobs.delete(key);
  };
  return {
    schedule(documentId: string, key: string, save: (isCurrent: () => boolean) => Promise<void>) {
      const id = JSON.stringify([documentId, key]);
      const previous = jobs.get(id);
      if (previous) cancel(id, previous);
      const job: Job = { documentId };
      jobs.set(id, job);
      job.timer = setTimeout(() => {
        const isCurrent = () => jobs.get(id) === job;
        const task = (tails.get(id) ?? Promise.resolve()).then(async () => {
          if (isCurrent()) await save(isCurrent);
        }).catch(onError).finally(() => {
          if (isCurrent()) jobs.delete(id);
          if (tails.get(id) === task) tails.delete(id);
        });
        tails.set(id, task);
      }, delay);
    },
    cancelDocument(documentId: string) {
      for (const [key, job] of jobs) if (job.documentId === documentId) cancel(key, job);
    },
    clear() {
      for (const [key, job] of jobs) cancel(key, job);
    },
  };
}
