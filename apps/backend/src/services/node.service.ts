import { nodeRepository } from '../repositories/node.repository.js';
import { NodeType, node as Node } from '@prisma/client';
import { BusinessConflictError, NotFoundError } from '../domain/types.js';


export class MockFileStorageService {
  async uploadFile(nodeId: string, name: string): Promise<string> {
    console.log(`[MockFileStorage] Uploading file payload for node: ${nodeId} (${name})`);
    return `mock://storage/buckets/tenant-files/${nodeId}`;
  }

  async deleteFile(nodeId: string): Promise<void> {
    console.log(`[MockFileStorage] Deleting file payload for node: ${nodeId}`);
  }
}

export const mockFileStorage = new MockFileStorageService();

export class NodeService {
  async createNode(
    owner_id: string,
    data: {
      name: string;
      type: NodeType;
      parent_id: string | null;
      path?: string | null;
    },
    role?: string
  ): Promise<Node> {
    
    const hasDuplicate = await nodeRepository.checkDuplicateName(data.name, data.parent_id, owner_id, role);
    if (hasDuplicate) {
      throw new BusinessConflictError(
        `A folder or file named "${data.name}" already exists in this directory.`
      );
    }

    
    let ancestry = '';
    if (data.parent_id) {
      const parent = await nodeRepository.findById(data.parent_id, owner_id, role);
      if (!parent) {
        throw new NotFoundError('Parent directory not found.');
      }
      if (parent.type !== NodeType.FOLDER) {
        throw new BusinessConflictError('Parent node must be a folder.');
      }
      ancestry = parent.ancestry + parent.id + '/';
    }

    
    const node = await nodeRepository.create({
      name: data.name,
      type: data.type,
      parent_id: data.parent_id,
      owner_id,
      ancestry,
      path: data.path ?? null,
    });

    
    if (node.type === NodeType.FILE) {
      await mockFileStorage.uploadFile(node.id, node.name);
    }

    return node;
  }

  async moveNode(
    id: string,
    destinationFolderId: string | null,
    owner_id: string,
    role?: string
  ): Promise<Node> {
    const node = await nodeRepository.findById(id, owner_id, role);
    if (!node) {
      throw new NotFoundError('Node to move not found.');
    }

    
    if (node.parent_id === destinationFolderId) {
      return node;
    }

    let newAncestry = '';

    if (destinationFolderId) {
      if (id === destinationFolderId) {
        throw new BusinessConflictError('Cannot move a folder into itself.');
      }

      const destNode = await nodeRepository.findById(destinationFolderId, owner_id, role);
      if (!destNode) {
        throw new NotFoundError('Destination folder not found.');
      }
      if (destNode.type !== NodeType.FOLDER) {
        throw new BusinessConflictError('Destination must be a folder.');
      }

      
      
      
      if (destNode.ancestry.split('/').includes(id)) {
        throw new BusinessConflictError('Cannot move a folder into one of its subfolders.');
      }

      newAncestry = destNode.ancestry + destNode.id + '/';
    }

    
    const hasDuplicate = await nodeRepository.checkDuplicateName(node.name, destinationFolderId, owner_id, role);
    if (hasDuplicate) {
      throw new BusinessConflictError(
        `A folder or file named "${node.name}" already exists in the destination directory.`
      );
    }

    
    const oldAncestryPrefix = node.ancestry + node.id + '/';
    const newAncestryPrefix = newAncestry + node.id + '/';

    
    const updatedNode = await nodeRepository.update(id, owner_id, {
      parent_id: destinationFolderId,
      ancestry: newAncestry,
    });

    
    if (node.type === NodeType.FOLDER) {
      const descendants = await nodeRepository.findDescendants(oldAncestryPrefix, owner_id, role);
      for (const desc of descendants) {
        const updatedDescAncestry = desc.ancestry.replace(oldAncestryPrefix, newAncestryPrefix);
        await nodeRepository.update(desc.id, owner_id, {
          ancestry: updatedDescAncestry,
        });
      }
    }

    return updatedNode;
  }

  async softDeleteNode(id: string, owner_id: string, role?: string): Promise<void> {
    const node = await nodeRepository.findById(id, owner_id, role);
    if (!node) {
      throw new NotFoundError('Node not found.');
    }

    const ancestryPrefix = node.ancestry + node.id + '/';

    
    const descendants = await nodeRepository.findDescendants(ancestryPrefix, owner_id, role);

    
    await nodeRepository.softDeleteSubtree(ancestryPrefix, owner_id, role);

    
    if (node.type === NodeType.FILE) {
      await mockFileStorage.deleteFile(node.id);
    }
    for (const desc of descendants) {
      if (desc.type === NodeType.FILE) {
        await mockFileStorage.deleteFile(desc.id);
      }
    }
  }

  async searchNodes(query: string, owner_id: string, role?: string): Promise<Node[]> {
    return nodeRepository.search(query, owner_id, role);
  }
}

export const nodeService = new NodeService();
