// Placeholder: stub for brand workflow router
import type { WorkflowPath } from '../../shared/types/brand-workflow-types';

class BrandWorkflowRouter {
  async route(
    visualDirection: string,
    narration: string,
    outputType: string
  ): Promise<WorkflowPath> {
    return 'standard';
  }
}

export const brandWorkflowRouter = new BrandWorkflowRouter();
