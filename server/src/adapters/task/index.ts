export type EnqueueTaskInput = {
  taskId: string;
  type: string;
};

export async function enqueueTask(input: EnqueueTaskInput) {
  return {
    queued: false,
    mode: "db-polling-placeholder",
    taskId: input.taskId,
    type: input.type
  };
}
