import { Router, Request, Response } from 'express';
import { WorkflowEngine } from '../services/workflow.service';

export const workflowRouter = Router();
const workflowEngine = new WorkflowEngine();

// Get all workflows
workflowRouter.get('/', async (req: Request, res: Response) => {
  try {
    const workflows = await workflowEngine.getAllWorkflows();
    res.json(workflows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get workflow by ID
workflowRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const workflow = await workflowEngine.getWorkflow(req.params.id);
    res.json(workflow);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Create workflow
workflowRouter.post('/', async (req: Request, res: Response) => {
  try {
    const workflow = await workflowEngine.createWorkflow(req.body);
    res.status(201).json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update workflow
workflowRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const workflow = await workflowEngine.updateWorkflow(req.params.id, req.body);
    res.json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete workflow
workflowRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await workflowEngine.deleteWorkflow(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Execute workflow
workflowRouter.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const executionResult = await workflowEngine.executeWorkflow(
      req.params.id,
      req.body.input,
      req.body.sessionId
    );
    res.json(executionResult);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get execution logs
workflowRouter.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const logs = await workflowEngine.getExecutionLogs(req.params.id, limit);
    res.json(logs);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
