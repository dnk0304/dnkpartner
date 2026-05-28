import cron, { ScheduledTask } from "node-cron"
import { listProjects, ProjectConfig } from "./projects"

export interface SchedulerTriggerPayload {
  projectId: string
  topic: string
  format?: "long" | "short"
  scheduled: true
  autoApprovePlan: true
}

interface AutopilotSchedulerDeps {
  triggerRun: (payload: SchedulerTriggerPayload) => Promise<void>
}

export class AutopilotScheduler {
  private jobs = new Map<string, ScheduledTask>()
  private readonly deps: AutopilotSchedulerDeps
  private runningProjects = new Set<string>()

  constructor(deps: AutopilotSchedulerDeps) {
    this.deps = deps
  }

  public refresh(): void {
    this.stop()
    const projects = listProjects()
    projects.forEach((project) => this.registerProjectJob(project))
  }

  private registerProjectJob(project: ProjectConfig): void {
    const schedule = project.schedule
    if (!schedule?.enabled) return
    if (!cron.validate(schedule.cron)) {
      console.warn(`[Scheduler] Invalid cron '${schedule.cron}' for project ${project.id}`)
      return
    }

    const task = cron.schedule(
      schedule.cron,
      async () => {
        if (this.runningProjects.has(project.id)) return
        if (this.runningProjects.size >= Math.max(1, schedule.maxConcurrentRuns || 1)) return
        this.runningProjects.add(project.id)
        try {
          await this.deps.triggerRun({
            projectId: project.id,
            topic: `Scheduled run ${new Date().toISOString()}`,
            format: "long",
            scheduled: true,
            autoApprovePlan: true,
          })
        } catch (error) {
          console.error(`[Scheduler] Failed scheduled run for project ${project.id}:`, error)
        } finally {
          this.runningProjects.delete(project.id)
        }
      },
      { timezone: schedule.timezone || "Europe/Oslo" }
    )

    this.jobs.set(project.id, task)
  }

  public stop(): void {
    for (const task of this.jobs.values()) {
      task.stop()
      if (typeof (task as any).destroy === "function") {
        ;(task as any).destroy()
      }
    }
    this.jobs.clear()
  }

  public getJobCount(): number {
    return this.jobs.size
  }

  public async triggerProjectNow(projectId: string): Promise<void> {
    const project = listProjects().find((item) => item.id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    await this.deps.triggerRun({
      projectId: project.id,
      topic: `Manual schedule trigger ${new Date().toISOString()}`,
      format: "long",
      scheduled: true,
      autoApprovePlan: true,
    })
  }
}

