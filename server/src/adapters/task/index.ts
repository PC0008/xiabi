export type EnqueueTaskInput = {
  taskId: string;
  type: string;
};

export async function enqueueTask(input: EnqueueTaskInput) {
  return {
    queued: true,
    mode: "edgespark-background",
    taskId: input.taskId,
    type: input.type
  };
}
