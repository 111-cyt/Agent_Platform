import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  InternalServerErrorException
} from '@nestjs/common';
import { WorkflowEngine } from '../services/workflow.service';

@Controller('workflow')
export class WorkflowController {
  private readonly workflowEngine = new WorkflowEngine();

  @Get()
  async getAllWorkflows() {
    try {
      return await this.workflowEngine.getAllWorkflows();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string) {
    try {
      return await this.workflowEngine.getWorkflow(id);
    } catch (error: any) {
      throw new NotFoundException(error.message);
    }
  }

  @Post()
  async createWorkflow(@Body() body: any) {
    try {
      return await this.workflowEngine.createWorkflow(body);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Put(':id')
  async updateWorkflow(@Param('id') id: string, @Body() body: any) {
    try {
      return await this.workflowEngine.updateWorkflow(id, body);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Delete(':id')
  async deleteWorkflow(@Param('id') id: string) {
    try {
      await this.workflowEngine.deleteWorkflow(id);
      return { success: true };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/execute')
  async executeWorkflow(
    @Param('id') id: string,
    @Body() body: { input: any; sessionId?: string }
  ) {
    try {
      return await this.workflowEngine.executeWorkflow(id, body?.input, body?.sessionId);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get(':id/logs')
  async getExecutionLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    try {
      const parsedLimit = limit ? parseInt(limit, 10) : 50;
      return await this.workflowEngine.getExecutionLogs(id, parsedLimit);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
