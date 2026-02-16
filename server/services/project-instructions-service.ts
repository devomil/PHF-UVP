class ProjectInstructionsService {
  async getCondensedRoleContext(): Promise<string> {
    return `You are an AI video production assistant. Follow brand guidelines, maintain visual consistency, and create engaging content that matches the project's style and tone.`;
  }

  async getFullContext(projectId?: string): Promise<string> {
    return this.getCondensedRoleContext();
  }
}

export const projectInstructionsService = new ProjectInstructionsService();
