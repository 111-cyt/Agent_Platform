import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Body,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from '../services/knowledge.service';
import { Public } from '../common/decorators/public.decorator';
import * as fs from 'fs';
import * as path from 'path';

@Public()
@Controller('knowledge')
export class KnowledgeController {
  private readonly knowledgeService = new KnowledgeService();

  @Get()
  async getAllKnowledge() {
    try {
      return await this.knowledgeService.getAllKnowledge();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Get(':id')
  async getKnowledge(@Param('id') id: string) {
    try {
      return await this.knowledgeService.getKnowledge(id);
    } catch (error: any) {
      throw new NotFoundException(error.message);
    }
  }

  @Post()
  async addKnowledge(@Body() body: { title: string; content: string }) {
    const { title, content } = body || ({} as any);
    if (!title || !String(title).trim()) {
      throw new BadRequestException('标题不能为空');
    }
    if (!content || !String(content).trim()) {
      throw new BadRequestException('内容不能为空');
    }

    try {
      return await this.knowledgeService.addKnowledge(title, content);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { dest: 'uploads/' }))
  async uploadKnowledge(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string }
  ) {
    let tempFilePath: string | undefined;
    try {
      fs.mkdirSync(path.resolve(process.cwd(), 'uploads'), { recursive: true });

      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      tempFilePath = file.path;
      if (!fs.existsSync(tempFilePath)) {
        throw new BadRequestException('Uploaded file not found on server');
      }

      const content = fs.readFileSync(tempFilePath, 'utf-8');
      if (!content || !content.trim()) {
        throw new BadRequestException('上传文件内容为空');
      }

      const title = body?.title || file.originalname;
      return await this.knowledgeService.addKnowledge(title, content, file.originalname);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  @Delete(':id')
  async deleteKnowledge(@Param('id') id: string) {
    try {
      await this.knowledgeService.deleteKnowledge(id);
      return { success: true };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('search')
  async search(@Body() body: { query: string; topK?: number; knowledgeBaseId?: string }) {
    try {
      return await this.knowledgeService.search(body.query, body.topK || 5, body.knowledgeBaseId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('reindex')
  async reindex() {
    try {
      await this.knowledgeService.rebuildVectorIndex();
      return { message: 'Vector index rebuilt successfully' };
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
