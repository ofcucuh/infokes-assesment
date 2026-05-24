import { Elysia, t } from 'elysia';
import { authPlugin } from '../infrastructure/auth.js';
import { nodeRepository } from '../repositories/node.repository.js';
import { nodeService } from '../services/node.service.js';
import { NodeType } from '@prisma/client';
import { ValidationError, ForbiddenError, NotFoundError, BusinessConflictError } from '../domain/types.js';
import fs from 'fs';
import path from 'path';

const INVENTORY_DIR = path.join(process.cwd(), 'inventory');
if (!fs.existsSync(INVENTORY_DIR)) {
  fs.mkdirSync(INVENTORY_DIR, { recursive: true });
}

function mapNodeToFrontend(node: any) {
  if (!node) return null;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parent_id,
    ownerId: node.owner_id,
    ancestry: node.ancestry,
    isDeleted: node.is_deleted,
    deletedAt: node.deleted_at,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    path: node.path,
    isEmpty: node.type === 'FOLDER' ? (node._count ? node._count.children === 0 : true) : undefined,
  };
}

function mapNodesToFrontend(nodes: any[]) {
  return nodes.map(mapNodeToFrontend);
}

export const nodeController = new Elysia({ prefix: '/nodes' })
  .use(authPlugin)
  .decorate('nodeService', nodeService)
  .decorate('nodeRepository', nodeRepository)
  
  .guard({
    async beforeHandle({ requireUser, store }) {
      const user = await requireUser();
      (store as any).user = user;
    }
  }, (app) => 
    app
      .get('/roots', async ({ store }) => {
        const user = (store as any).user;
        const roots = await nodeRepository.findRoots(user.id, user.role);
        return mapNodesToFrontend(roots);
      })

      .get('/:id/children', async ({ params: { id }, store }) => {
        const user = (store as any).user;
        const children = await nodeRepository.findChildren(id, user.id, user.role);
        return mapNodesToFrontend(children);
      }, {
        params: t.Object({
          id: t.String(),
        })
      })

      .get('/:id/contents', async ({ params: { id }, store }) => {
        const user = (store as any).user;
        const parentId = id === 'root' || id === 'null' ? null : id;
        
        if (parentId !== null) {
          const folder = await nodeRepository.findById(parentId, user.id, user.role);
          if (!folder) {
            throw new ValidationError('Target directory does not exist or is deleted.');
          }
          if (folder.type !== NodeType.FOLDER) {
            throw new ValidationError('Target node is not a directory.');
          }
        }
        
        const contents = await nodeRepository.findContents(parentId, user.id, user.role);
        return mapNodesToFrontend(contents);
      }, {
        params: t.Object({
          id: t.String(),
        })
      })

      .post('/', async ({ body, store, nodeService }) => {
        const user = (store as any).user;
        if (user.role === 'VIEWER') {
          throw new ForbiddenError('Viewers are not allowed to modify files or folders.');
        }

        const parentId = body.parentId;
        const name = body.name;
        const type = body.type;
        const file = (body as any).file;

        const node = await nodeService.createNode(user.id, {
          name: name,
          type: type,
          parent_id: parentId || null,
        }, user.role);

        if (type === 'FILE') {
          const filePath = path.join(INVENTORY_DIR, node.id);
          if (file) {
            const arrayBuffer = await file.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
          } else {
            fs.writeFileSync(filePath, '');
          }

          const relativePath = `inventory/${node.id}`;
          await nodeRepository.update(node.id, user.id, {
            path: relativePath
          });
          node.path = relativePath;
        }

        return mapNodeToFrontend(node);
      }, {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          type: t.Enum(NodeType),
          parentId: t.Nullable(t.String()),
          file: t.Optional(t.Any())
        })
      })

      .patch('/:id/move', async ({ params: { id }, body, store, nodeService }) => {
        const user = (store as any).user;
        if (user.role === 'VIEWER') {
          throw new ForbiddenError('Viewers are not allowed to modify files or folders.');
        }

        const updatedNode = await nodeService.moveNode(
          id,
          body.destinationFolderId,
          user.id,
          user.role
        );
        return mapNodeToFrontend(updatedNode);
      }, {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          destinationFolderId: t.Nullable(t.String()),
        })
      })

      .patch('/:id/rename', async ({ params: { id }, body, store, nodeRepository }) => {
        const user = (store as any).user;
        if (user.role === 'VIEWER') {
          throw new ForbiddenError('Viewers are not allowed to modify files or folders.');
        }

        const newName = body.name;

        const node = await nodeRepository.findById(id, user.id, user.role);
        if (!node) {
          throw new ValidationError('Node to rename not found.');
        }
        
        const hasDuplicate = await nodeRepository.checkDuplicateName(newName, node.parent_id, user.id, user.role);
        if (hasDuplicate) {
          throw new ValidationError(`A folder or file named "${newName}" already exists in this directory.`);
        }
        
        const updatedNode = await nodeRepository.update(id, user.id, {
          name: newName
        });
        
        return mapNodeToFrontend(updatedNode);
      }, {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          name: t.String({ minLength: 1 }),
        })
      })



      .delete('/:id', async ({ params: { id }, store, nodeService }) => {
        const user = (store as any).user;
        if (user.role === 'VIEWER') {
          throw new ForbiddenError('Viewers are not allowed to modify files or folders.');
        }

        await nodeService.softDeleteNode(id, user.id, user.role);
        return { success: true, message: 'Node and contents soft-deleted successfully' };
      }, {
        params: t.Object({
          id: t.String(),
        })
      })

      .get('/search', async ({ query: { q, mode }, store, nodeService }) => {
        const user = (store as any).user;
        if (!q) {
          return [];
        }

        const matches = await nodeService.searchNodes(q, user.id, user.role);
        const mapped = mapNodesToFrontend(matches).filter((n): n is NonNullable<typeof n> => n !== null);

        if (mode === 'local') {
          return mapped.filter(n => n.ancestry.split('/').includes('local-root') || n.id === 'local-root');
        } else {
          return mapped.filter(n => !n.ancestry.split('/').includes('local-root') && n.id !== 'local-root');
        }
      }, {
        query: t.Object({
          q: t.String(),
          mode: t.Optional(t.String())
        })
      })

      .get('/:id/download', async ({ params: { id }, store, set }) => {
        const user = (store as any).user;

        const node = await nodeRepository.findById(id, user.id, user.role);
        if (!node || node.type !== 'FILE') {
          set.status = 404;
          return 'File not found';
        }

        const filePath = node.path ? path.resolve(process.cwd(), node.path) : path.join(INVENTORY_DIR, node.id);
        if (!fs.existsSync(filePath)) {
          set.status = 404;
          return 'File data not found';
        }

        set.headers['Content-Disposition'] = `attachment; filename="${node.name}"`;
        return new Response(fs.readFileSync(filePath), {
          headers: set.headers as Record<string, string>
        });
      }, {
        params: t.Object({
          id: t.String()
        })
      })
  );
