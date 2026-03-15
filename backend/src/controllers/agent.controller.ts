import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Body,
  InternalServerErrorException
} from '@nestjs/common';
import { AgentService } from '../services/agent.service';

@Controller('agent')
export class AgentController {
  private readonly agentService = new AgentService();

  @Get('sessions')
  async getAllSessions() {
    try {
      return await this.agentService.getAllSessions();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post('sessions')
  async createSession(@Body() body: { workflowId?: string }) {
    try {
      return await this.agentService.createSession(body?.workflowId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    try {
      return await this.agentService.getSession(id);
    } catch (error: any) {
      throw new NotFoundException(error.message);
    }
  }

  @Delete('sessions/:id')
  async deleteSession(@Param('id') id: string) {
    try {
      await this.agentService.deleteSession(id);
      return { success: true };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('sessions/:id/messages')
  async getSessionHistory(@Param('id') id: string) {
    try {
      return await this.agentService.getSessionHistory(id);
    } catch (error: any) {
      throw new NotFoundException(error.message);
    }
  }

  @Post('chat')
  async chat(@Body() body: { sessionId: string; message: string; useRAG?: boolean }) {
    const { sessionId, message, useRAG } = body || ({} as any);
    if (!sessionId || !message) {
      throw new BadRequestException('sessionId and message are required');
    }

    try {
      return await this.agentService.chat(sessionId, message, useRAG !== false);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
