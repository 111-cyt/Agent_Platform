import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { User } from './entities/user.entity';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { AgentController } from './controllers/agent.controller';
import { KnowledgeController } from './controllers/knowledge.controller';
import { WorkflowController } from './controllers/workflow.controller';
import { AppController } from './controllers/app.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'coze_platform',
      entities: [User],
      synchronize: true
    }),
    AuthModule
  ],
  controllers: [AppController, AgentController, KnowledgeController, WorkflowController],
  providers: [
    JwtStrategy
  ]
})
export class AppModule {}
