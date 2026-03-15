import { Router, Request, Response } from 'express';
import { AgentService } from '../services/agent.service';

export const agentRouter = Router();
const agentService = new AgentService();

// Get all sessions
agentRouter.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await agentService.getAllSessions();
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create session
agentRouter.post('/sessions', async (req: Request, res: Response) => {
  try {
    const session = await agentService.createSession(req.body.workflowId);
    res.status(201).json(session);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get session
agentRouter.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await agentService.getSession(req.params.id);
    res.json(session);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Delete session
agentRouter.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    await agentService.deleteSession(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get session history
agentRouter.get('/sessions/:id/messages', async (req: Request, res: Response) => {
  try {
    const messages = await agentService.getSessionHistory(req.params.id);
    res.json(messages);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Chat
agentRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, useRAG } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const response = await agentService.chat(sessionId, message, useRAG !== false);
    res.json(response);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
