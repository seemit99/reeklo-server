import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Spring CharacterDto.PartResponse와 동일 (is_approved 미노출)
export function toPartDto(p: any) {
  return {
    id: p.id,
    creatorId: p.creator_id,
    name: p.name,
    partType: p.part_type,
    imageUrl: p.image_url,
    price: p.price,
    downloadCount: p.download_count,
    pivotX: p.pivot_x,
    pivotY: p.pivot_y,
    createdAt: p.created_at,
  }
}

// Spring CharacterDto.PresetResponse와 동일
function toPresetDto(p: any) {
  return {
    id: p.id,
    userId: p.user_id,
    headPartId: p.head_part_id,
    bodyPartId: p.body_part_id,
    armLPartId: p.arm_l_part_id,
    armRPartId: p.arm_r_part_id,
    legLPartId: p.leg_l_part_id,
    legRPartId: p.leg_r_part_id,
    accessoryPartId: p.accessory_part_id,
    layerOrder: p.layer_order,
    rigPivots: p.rig_pivots,
    updatedAt: p.updated_at,
  }
}

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  async getParts(type?: string) {
    const parts = await this.prisma.character_parts.findMany({
      where: { is_approved: true, ...(type ? { part_type: type } : {}) },
      orderBy: { created_at: 'desc' },
    })
    return parts.map(toPartDto)
  }

  async createPart(userId: number, req: any) {
    const part = await this.prisma.character_parts.create({
      data: {
        creator_id: userId,
        name: req.name,
        part_type: req.partType,
        image_url: req.imageUrl,
        price: req.price ?? 0,
        pivot_x: req.pivotX ?? null,
        pivot_y: req.pivotY ?? null,
        is_approved: true, // 개발용 자동 승인 (Spring과 동일)
      },
    })
    return toPartDto(part)
  }

  async deletePart(partId: number, userId: number) {
    const part = await this.prisma.character_parts.findUnique({ where: { id: partId } })
    if (!part) throw new NotFoundException('파츠를 찾을 수 없습니다.')
    if (Number(part.creator_id) !== userId) {
      throw new ForbiddenException('본인 파츠만 삭제할 수 있습니다.')
    }
    await this.prisma.character_parts.delete({ where: { id: partId } })
  }

  async getPreset(userId: number) {
    const preset = await this.prisma.character_presets.findUnique({ where: { user_id: userId } })
    // 프리셋이 없으면 userId만 채운 빈 응답 (Spring과 동일)
    if (!preset) {
      return {
        id: null, userId, headPartId: null, bodyPartId: null,
        armLPartId: null, armRPartId: null, legLPartId: null, legRPartId: null,
        accessoryPartId: null, layerOrder: null, rigPivots: null, updatedAt: null,
      }
    }
    return toPresetDto(preset)
  }

  async savePreset(userId: number, req: any) {
    const data = {
      head_part_id: req.headPartId ?? null,
      body_part_id: req.bodyPartId ?? null,
      arm_l_part_id: req.armLPartId ?? null,
      arm_r_part_id: req.armRPartId ?? null,
      leg_l_part_id: req.legLPartId ?? null,
      leg_r_part_id: req.legRPartId ?? null,
      accessory_part_id: req.accessoryPartId ?? null,
      layer_order: req.layerOrder ?? null,
      rig_pivots: req.rigPivots ?? null,
      updated_at: new Date(),
    }
    const preset = await this.prisma.character_presets.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    })
    return toPresetDto(preset)
  }
}
