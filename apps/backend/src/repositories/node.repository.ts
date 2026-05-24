import { db } from '../infrastructure/db.js';
import { NodeType, node as Node } from '@prisma/client';

export class NodeRepository {
  async isNodeAccessible(node: Node, owner_id: string, role?: string): Promise<boolean> {
    if (node.id === 'local-root' || node.ancestry.split('/').includes('local-root')) {
      return true;
    }
    if (role === 'MEMBER') {
      return node.owner_id === owner_id;
    }
    if (role === 'VIEWER') {
      const checkIds = [node.id, ...node.ancestry.split('/').filter(Boolean)];
      const shareCount = await db.share.count({
        where: {
          node_id: { in: checkIds }
        }
      });
      return shareCount > 0;
    }
    return false;
  }

  async findById(id: string, owner_id: string, role?: string): Promise<Node | null> {
    const node = await db.node.findFirst({
      where: {
        id,
        is_deleted: false,
      },
      include: {
        _count: {
          select: {
            children: {
              where: { is_deleted: false }
            }
          }
        }
      }
    });
    if (!node) return null;

    const accessible = await this.isNodeAccessible(node, owner_id, role);
    if (!accessible) return null;

    return node;
  }

  async findRoots(owner_id: string, role?: string): Promise<Node[]> {
    if (role === 'VIEWER') {
      return [];
    }
    return db.node.findMany({
      where: {
        parent_id: null,
        type: NodeType.FOLDER,
        is_deleted: false,
        OR: [
          { owner_id },
          { id: 'local-root' }
        ]
      },
      include: {
        _count: {
          select: {
            children: {
              where: { is_deleted: false }
            }
          }
        }
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findChildren(parent_id: string, owner_id: string, role?: string): Promise<Node[]> {
    const parent = await db.node.findFirst({ where: { id: parent_id, is_deleted: false } });
    if (!parent) return [];

    const accessible = await this.isNodeAccessible(parent, owner_id, role);
    if (!accessible) return [];

    const isLocalSubtree = parent.id === 'local-root' || parent.ancestry.split('/').includes('local-root');
    const isSharedSubtree = role === 'VIEWER';

    return db.node.findMany({
      where: {
        parent_id,
        type: NodeType.FOLDER,
        is_deleted: false,
        ...((isLocalSubtree || isSharedSubtree) ? {} : { owner_id }),
      },
      include: {
        _count: {
          select: {
            children: {
              where: { is_deleted: false }
            }
          }
        }
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findContents(parent_id: string | null, owner_id: string, role?: string): Promise<Node[]> {
    if (parent_id === null) {
      if (role === 'VIEWER') {
        return [];
      }
      return db.node.findMany({
        where: {
          parent_id: null,
          is_deleted: false,
          owner_id,
        },
        include: {
          _count: {
            select: {
              children: {
                where: { is_deleted: false }
              }
            }
          }
        },
        orderBy: [
          { type: 'asc' }, 
          { name: 'asc' },
        ],
      });
    }

    const parent = await db.node.findFirst({ where: { id: parent_id, is_deleted: false } });
    if (!parent) return [];

    const accessible = await this.isNodeAccessible(parent, owner_id, role);
    if (!accessible) return [];

    const isLocalSubtree = parent.id === 'local-root' || parent.ancestry.split('/').includes('local-root');
    const isSharedSubtree = role === 'VIEWER';

    return db.node.findMany({
      where: {
        parent_id,
        is_deleted: false,
        ...((isLocalSubtree || isSharedSubtree) ? {} : { owner_id }),
      },
      include: {
        _count: {
          select: {
            children: {
              where: { is_deleted: false }
            }
          }
        }
      },
      orderBy: [
        { type: 'asc' }, 
        { name: 'asc' },
      ],
    });
  }

  async create(data: {
    name: string;
    type: NodeType;
    parent_id: string | null;
    owner_id: string;
    ancestry: string;
    path?: string | null;
  }): Promise<Node> {
    return db.node.create({
      data: {
        name: data.name,
        type: data.type,
        parent_id: data.parent_id,
        owner_id: data.owner_id,
        ancestry: data.ancestry,
        path: data.path ?? null,
      },
    });
  }

  async update(
    id: string,
    owner_id: string,
    data: {
      name?: string;
      parent_id?: string | null;
      ancestry?: string;
      is_deleted?: boolean;
      deleted_at?: Date | null;
      path?: string | null;
    }
  ): Promise<Node> {
    return db.node.update({
      where: {
        id,
      },
      data,
      include: {
        _count: {
          select: {
            children: {
              where: { is_deleted: false }
            }
          }
        }
      }
    });
  }

  async findDescendants(ancestryPrefix: string, owner_id: string, role?: string): Promise<Node[]> {
    const isLocalSubtree = ancestryPrefix.split('/').includes('local-root');
    const isSharedSubtree = role === 'VIEWER';
    return db.node.findMany({
      where: {
        is_deleted: false,
        ancestry: {
          startsWith: ancestryPrefix,
        },
        ...((isLocalSubtree || isSharedSubtree) ? {} : { owner_id }),
      },
    });
  }

  async softDeleteSubtree(ancestryPrefix: string, owner_id: string, role?: string): Promise<void> {
    const now = new Date();
    const parts = ancestryPrefix.split('/').filter(Boolean);
    const targetId = parts[parts.length - 1];
    const isLocalSubtree = ancestryPrefix.split('/').includes('local-root');
    const isSharedSubtree = role === 'VIEWER';

    await db.node.updateMany({
      where: {
        is_deleted: false,
        OR: [
          { ancestry: { startsWith: ancestryPrefix } },
          ...(targetId ? [{ id: targetId }] : [])
        ],
        ...((isLocalSubtree || isSharedSubtree) ? {} : { owner_id }),
      },
      data: {
        is_deleted: true,
        deleted_at: now,
      },
    });
  }

  async search(query: string, owner_id: string, role?: string): Promise<Node[]> {
    if (role === 'VIEWER') {
      const shareRecords = await db.share.findMany({
        select: { node_id: true }
      });
      const sharedNodeIds = shareRecords.map(s => s.node_id);
      if (sharedNodeIds.length === 0) {
        return [];
      }

      const ancestryConditions = sharedNodeIds.map(id => ({
        ancestry: { contains: id }
      }));

      return db.node.findMany({
        where: {
          is_deleted: false,
          name: {
            contains: query,
            mode: 'insensitive',
          },
          OR: [
            { id: { in: sharedNodeIds } },
            ...ancestryConditions
          ]
        },
        orderBy: [
          { type: 'asc' },
          { name: 'asc' },
        ],
      });
    }

    return db.node.findMany({
      where: {
        is_deleted: false,
        name: {
          contains: query,
          mode: 'insensitive',
        },
        OR: [
          { owner_id },
          { ancestry: { contains: 'local-root' } },
          { id: 'local-root' }
        ]
      },
      orderBy: [
        { type: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async checkDuplicateName(
    name: string,
    parent_id: string | null,
    owner_id: string,
    role?: string
  ): Promise<boolean> {
    let isLocalSubtree = false;
    if (parent_id) {
      const parent = await db.node.findFirst({ where: { id: parent_id, is_deleted: false } });
      isLocalSubtree = parent !== null && (parent.id === 'local-root' || parent.ancestry.split('/').includes('local-root'));
    }
    const isSharedSubtree = role === 'VIEWER';
    const existing = await db.node.findFirst({
      where: {
        name,
        parent_id,
        is_deleted: false,
        ...((isLocalSubtree || isSharedSubtree) ? {} : { owner_id }),
      },
    });
    return existing !== null;
  }
}

export const nodeRepository = new NodeRepository();
