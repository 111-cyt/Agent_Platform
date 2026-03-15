import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService
  ) {}

  async register(payload: RegisterDto) {
    const exists = await this.usersRepository.findOne({ where: { username: payload.username } });
    if (exists) {
      throw new ConflictException('用户名已存在');
    }

    const hashedPassword = await bcrypt.hash(payload.password, 10);
    const user = this.usersRepository.create({
      username: payload.username,
      password: hashedPassword
    });
    const saved = await this.usersRepository.save(user);

    return {
      id: saved.id,
      username: saved.username,
      created_at: saved.created_at
    };
  }

  async login(payload: LoginDto) {
    const user = await this.usersRepository.findOne({ where: { username: payload.username } });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(payload.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      user: {
        id: user.id,
        username: user.username
      }
    };
  }
}
