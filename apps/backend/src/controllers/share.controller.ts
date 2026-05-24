import { Elysia, t } from 'elysia';
import { authPlugin } from '../infrastructure/auth.js';
import { db } from '../infrastructure/db.js';
import { ForbiddenError, ValidationError, NotFoundError } from '../domain/types.js';

export const shareController = new Elysia({ prefix: '/shares' })
  .use(authPlugin)
  .guard({
    async beforeHandle({ requireUser, store }) {
      const user = await requireUser();
      (store as any).user = user;
    }
  }, (app) =>
    app
      .post('/', async ({ body, store }) => {
        const user = (store as any).user;
        if (user.role !== 'MEMBER') {
          throw new ForbiddenError('Only MEMBER can create share links.');
        }

        const { nodeId } = body;

        // Check if node exists and belongs to the user
        const node = await db.node.findFirst({
          where: {
            id: nodeId,
            is_deleted: false,
            owner_id: user.id
          }
        });

        if (!node) {
          throw new ValidationError('Folder or file to share not found or not owned by you.');
        }

        // Find or create share link
        let existingShare = await db.share.findFirst({
          where: { node_id: nodeId }
        });

        if (!existingShare) {
          existingShare = await db.share.create({
            data: {
              node_id: nodeId,
              shared_by: user.id
            }
          });
        }

        return existingShare;
      }, {
        body: t.Object({
          nodeId: t.String(),
        })
      })

      .get('/:id', async ({ params: { id } }) => {
        const share = await db.share.findUnique({
          where: { id },
          include: {
            node: true
          }
        });

        if (!share || share.node.is_deleted) {
          throw new NotFoundError('Shared link not found or has been deleted.');
        }

        return {
          id: share.id,
          nodeId: share.node_id,
          nodeName: share.node.name,
          nodeType: share.node.type,
          parentId: share.node.parent_id,
          ancestry: share.node.ancestry,
          createdAt: share.created_at
        };
      }, {
        params: t.Object({
          id: t.String()
        })
      })
  );
