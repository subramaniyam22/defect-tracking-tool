import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  // Projects are now PMCs (Project Management Companies)
  async create(createProjectDto: CreateProjectDto) {
    return this.prisma.pMC.create({
      data: { name: createProjectDto.name },
    });
  }

  async findAll() {
    return this.prisma.pMC.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pmc = await this.prisma.pMC.findUnique({
      where: { id },
      include: {
        defects: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
        locations: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!pmc) {
      throw new NotFoundException(`PMC with ID ${id} not found`);
    }

    return pmc;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    try {
      return await this.prisma.pMC.update({
        where: { id },
        data: { name: updateProjectDto.name },
      });
    } catch (error) {
      throw new NotFoundException(`PMC with ID ${id} not found`);
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.pMC.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException(`PMC with ID ${id} not found`);
    }
  }
}

