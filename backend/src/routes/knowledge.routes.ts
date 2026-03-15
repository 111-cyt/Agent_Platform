import { Router, Request, Response } from 'express';
import { KnowledgeService } from '../services/knowledge.service';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';

export const knowledgeRouter = Router();
const knowledgeService = new KnowledgeService();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Get all knowledge items
knowledgeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const items = await knowledgeService.getAllKnowledge();
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get knowledge by ID
knowledgeRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await knowledgeService.getKnowledge(req.params.id);
    res.json(item);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Add knowledge (text)
knowledgeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { title, content } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: '内容不能为空' });
    }
    const item = await knowledgeService.addKnowledge(title, content);
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Upload knowledge file
knowledgeRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  let tempFilePath: string | undefined;
  try {
    fs.mkdirSync(path.resolve(process.cwd(), 'uploads'), { recursive: true });

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    tempFilePath = req.file.path;

    if (!fs.existsSync(tempFilePath)) {
      return res.status(400).json({ error: 'Uploaded file not found on server' });
    }

    const content = fs.readFileSync(tempFilePath, 'utf-8');
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '上传文件内容为空' });
    }

    const title = req.body.title || req.file.originalname;

    const item = await knowledgeService.addKnowledge(title, content, req.file.originalname);

    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// Delete knowledge
knowledgeRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await knowledgeService.deleteKnowledge(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Search knowledge
knowledgeRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, topK, knowledgeBaseId } = req.body;
    const results = await knowledgeService.search(query, topK || 5, knowledgeBaseId);
    res.json(results);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Rebuild vector index
knowledgeRouter.post('/reindex', async (req: Request, res: Response) => {
  try {
    await knowledgeService.rebuildVectorIndex();
    res.json({ message: 'Vector index rebuilt successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
