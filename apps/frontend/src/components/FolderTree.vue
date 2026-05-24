<script setup lang="ts">
import { ref, watch, inject } from 'vue';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from 'lucide-vue-next';

interface FileNode {
  id: string;
  name: string;
  type: 'FOLDER' | 'FILE';
  parentId: string | null;
  ownerId: string;
  ancestry: string;
  createdAt?: string;
  updatedAt?: string;
  isEmpty?: boolean;
  children?: FileNode[];
  isLocalDisk?: boolean;
  isVisible?: boolean;
}

const props = defineProps<{
  node: FileNode;
  selectedId: string | null;
  authToken: string;
  userRole?: string | undefined;
}>();

const emit = defineEmits<{
  (e: 'select', folderId: string, folderName: string): void;
  (e: 'node-moved'): void;
  (e: 'contextmenu', event: MouseEvent, node: FileNode): void;
}>();

const isOpen = ref(false);
const loading = ref(false);
const loaded = ref(false);
const children = ref<FileNode[]>([]);
const isDragOver = ref(false);

const registerFolders = inject<any>('registerFolders', null);
const treeRefreshTrigger = inject<any>('treeRefreshTrigger', null);

if (registerFolders && props.node) {
  registerFolders([props.node]);
}

if (treeRefreshTrigger) {
  watch(treeRefreshTrigger, (folderId) => {
    if (folderId === props.node.id) {
      if (isOpen.value) {
        fetchChildren();
      }
    }
  });
}

const handleContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  emit('contextmenu', e, props.node);
};


watch(() => props.selectedId, (newId) => {
  
  if (newId === props.node.id) {
    
  }
});

const toggleExpand = async (e: Event) => {
  e.stopPropagation();
  isOpen.value = !isOpen.value;
  
  if (isOpen.value && !loaded.value) {
    await fetchChildren();
  }
};

const fetchChildren = async () => {
  loading.value = true;
  try {
    const res = await fetch(`/api/v1/nodes/${props.node.id}/children`, {
      headers: {
        'Authorization': `Bearer ${props.authToken}`
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      const payload = data.data;
      children.value = payload;
      loaded.value = true;
      if (registerFolders) {
        registerFolders(payload);
      }
    }
  } catch (error) {
    console.error('Failed to load lazy children:', error);
  } finally {
    loading.value = false;
  }
};

const handleSelect = () => {
  emit('select', props.node.id, props.node.name);
};


const onSubSelect = (folderId: string, folderName: string) => {
  emit('select', folderId, folderName);
};

const onSubNodeMoved = () => {
  
  if (isOpen.value) {
    fetchChildren();
  }
  emit('node-moved');
};


const handleDragOver = (e: DragEvent) => {
  if (props.userRole === 'VIEWER') return;
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  isDragOver.value = true;
};

const handleDragLeave = () => {
  isDragOver.value = false;
};

const handleDrop = async (e: DragEvent) => {
  if (props.userRole === 'VIEWER') return;
  e.preventDefault();
  isDragOver.value = false;
  
  if (!e.dataTransfer) return;
  const draggedNodeId = e.dataTransfer.getData('text/plain');
  
  if (!draggedNodeId || draggedNodeId === props.node.id) {
    return;
  }

  try {
    const res = await fetch(`/api/v1/nodes/${draggedNodeId}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${props.authToken}`
      },
      body: JSON.stringify({
        destinationFolderId: props.node.id
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || 'Failed to move node');
      return;
    }

    
    await fetchChildren();
    emit('node-moved');
  } catch (err) {
    console.error('Error moving node via Drag & Drop:', err);
  }
};


defineExpose({
  refresh: fetchChildren
});
</script>

<template>
  <div class="select-none text-slate-300">
    
    <div
      @click="handleSelect"
      @dblclick="toggleExpand"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @contextmenu.prevent.stop="handleContextMenu"
      class="tree-node-item"
      :data-id="node.id"
      :data-name="node.name"
      :data-open="isOpen.toString()"
      :data-parent-id="node.parentId || ''"
      :class="[
        'group flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-150',
        selectedId === node.id 
          ? 'bg-brand-600/20 text-brand-300 font-medium border-l-2 border-brand-500 pl-1.5' 
          : 'hover:bg-slate-800/50 hover:text-white',
        isDragOver ? 'bg-brand-500/20 border-2 border-dashed border-brand-500 py-1' : ''
      ]"
    >
      
      <button
        @click="toggleExpand"
        class="expand-btn w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700/50"
      >
        <Loader2 v-if="loading" class="w-3.5 h-3.5 animate-spin" />
        <template v-else>
          <ChevronDown v-if="isOpen" class="w-4 h-4" />
          <ChevronRight v-else class="w-4 h-4" />
        </template>
      </button>

      
      <FolderOpen v-if="isOpen" class="w-4 h-4 text-amber-400 shrink-0" />
      <Folder v-else class="w-4 h-4 text-amber-500 shrink-0" />

      
      <span class="text-sm truncate select-none">{{ node.name }}</span>
    </div>

    
    <div
      v-if="isOpen && children.length > 0"
      class="ml-3 pl-3.5 border-l border-slate-800/80 mt-0.5 space-y-0.5"
    >
      <FolderTree
        v-for="child in children"
        :key="child.id"
        :node="child"
        :selectedId="selectedId"
        :authToken="authToken"
        :userRole="userRole"
        @select="onSubSelect"
        @node-moved="onSubNodeMoved"
        @contextmenu="(e, n) => emit('contextmenu', e, n)"
      />
    </div>
    
    
    <div
      v-else-if="isOpen && children.length === 0 && !loading && node.isEmpty"
      class="ml-8 py-1 text-xs text-slate-600 italic select-none"
    >
      Empty folder
    </div>
  </div>
</template>
