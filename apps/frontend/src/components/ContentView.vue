<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { 
  Folder, 
  File, 
  FileText, 
  FileImage, 
  FileCode, 
  FileVideo, 
  FileAudio, 
  Archive, 
  Trash2, 
  Edit3, 
  Check, 
  X,
  LayoutGrid, 
  List,
  Calendar,
  User,
  ExternalLink,
  Download,
  Loader2
} from 'lucide-vue-next';

interface FileNode {
  id: string;
  name: string;
  type: 'FOLDER' | 'FILE';
  parentId: string | null;
  ownerId: string;
  ancestry: string;
  createdAt: string;
  updatedAt: string;
  isLocalDisk?: boolean;
  isVisible?: boolean;
}

const props = defineProps<{
  items: FileNode[];
  selectedFolderId: string | null;
  authToken: string;
  showProperties: boolean;
  userRole?: string | undefined;
}>();

const emit = defineEmits<{
  (e: 'navigate', folderId: string, folderName: string): void;
  (e: 'delete', itemId: string | string[]): void;
  (e: 'rename', itemId: string, newName: string): void;
  (e: 'toggle-properties'): void;
  (e: 'create-node', type: 'FOLDER' | 'FILE'): void;
  (e: 'refresh'): void;
}>();

const viewMode = ref<'grid' | 'list'>('grid');
const selectedItemIds = ref<string[]>([]);
const selectedItemId = computed(() => {
  return selectedItemIds.value.length > 0 ? selectedItemIds.value[selectedItemIds.value.length - 1] : null;
});

const renamingId = ref<string | null>(null);
const renameValue = ref('');

const previewUrl = ref<string | null>(null);
const textPreviewContent = ref<string>('');
const loadingPreview = ref(false);

const downloadFile = async (item: FileNode) => {
  try {
    const res = await fetch(`/api/v1/nodes/${item.id}/download`, {
      headers: {
        'Authorization': `Bearer ${props.authToken}`
      }
    });
    if (!res.ok) {
      alert('Failed to download file');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download error:', err);
    alert('Error downloading file');
  }
};

const handleDoubleClick = async (item: FileNode) => {
  if (item.type === 'FOLDER') {
    emit('navigate', item.id, item.name);
    selectedItemIds.value = [];
  } else {
    const ext = item.name.split('.').pop()?.toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '');
    const isVideo = ['mp4', 'webm', 'ogg'].includes(ext || '');
    const isText = ['txt', 'md', 'json', 'js', 'ts', 'vue', 'html', 'css', 'py', 'go', 'sh', 'yml', 'yaml'].includes(ext || '');

    if (isImage || isVideo || isText) {
      activePreviewFile.value = item;
      loadingPreview.value = true;
      if (previewUrl.value) {
        window.URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = null;
      }
      textPreviewContent.value = '';
      
      try {
        const res = await fetch(`/api/v1/nodes/${item.id}/download`, {
          headers: {
            'Authorization': `Bearer ${props.authToken}`
          }
        });
        if (!res.ok) {
          alert('Failed to load file preview');
          activePreviewFile.value = null;
          return;
        }

        if (isText) {
          textPreviewContent.value = await res.text();
        } else {
          const blob = await res.blob();
          previewUrl.value = window.URL.createObjectURL(blob);
        }
      } catch (err) {
        console.error('Preview error:', err);
        alert('Failed to load file preview');
        activePreviewFile.value = null;
      } finally {
        loadingPreview.value = false;
      }
    } else {
      await downloadFile(item);
    }
  }
};

const closePreview = () => {
  if (previewUrl.value) {
    window.URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
  activePreviewFile.value = null;
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt':
    case 'md':
    case 'doc':
    case 'docx':
    case 'pdf':
      return FileText;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return FileImage;
    case 'js':
    case 'ts':
    case 'vue':
    case 'html':
    case 'css':
    case 'json':
    case 'py':
    case 'go':
    case 'sh':
      return FileCode;
    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'mov':
      return FileVideo;
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
      return FileAudio;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return Archive;
    default:
      return File;
  }
};

const getFileIconClass = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt':
    case 'md':
    case 'doc':
    case 'docx':
    case 'pdf':
      return 'text-blue-400 bg-blue-500/10';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return 'text-emerald-400 bg-emerald-500/10';
    case 'js':
    case 'ts':
    case 'vue':
    case 'html':
    case 'css':
    case 'json':
    case 'py':
    case 'go':
    case 'sh':
      return 'text-violet-400 bg-violet-500/10';
    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'mov':
      return 'text-red-400 bg-red-500/10';
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
      return 'text-cyan-400 bg-cyan-500/10';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return 'text-amber-400 bg-amber-500/10';
    default:
      return 'text-slate-400 bg-slate-500/10';
  }
};

const toggleSingleSelect = (item: FileNode) => {
  const index = selectedItemIds.value.indexOf(item.id);
  if (index > -1) {
    selectedItemIds.value.splice(index, 1);
  } else {
    selectedItemIds.value.push(item.id);
  }
};

const toggleSelectAll = () => {
  if (props.items.length === 0) return;
  const allSelected = props.items.every(i => selectedItemIds.value.includes(i.id));
  if (allSelected) {
    const itemIds = props.items.map(i => i.id);
    selectedItemIds.value = selectedItemIds.value.filter(id => !itemIds.includes(id));
  } else {
    props.items.forEach(i => {
      if (!selectedItemIds.value.includes(i.id)) {
        selectedItemIds.value.push(i.id);
      }
    });
  }
};

const handleSelectItem = (item: FileNode, event?: MouseEvent) => {
  if (event && (event.ctrlKey || event.metaKey)) {
    toggleSingleSelect(item);
  } else if (event && event.shiftKey && selectedItemIds.value.length > 0) {
    const lastSelectedId = selectedItemIds.value[selectedItemIds.value.length - 1];
    const lastIndex = props.items.findIndex(i => i.id === lastSelectedId);
    const currentIndex = props.items.findIndex(i => i.id === item.id);
    if (lastIndex > -1 && currentIndex > -1) {
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      const toSelect = props.items.slice(start, end + 1).map(i => i.id);
      toSelect.forEach(id => {
        if (!selectedItemIds.value.includes(id)) {
          selectedItemIds.value.push(id);
        }
      });
    }
  } else {
    selectedItemIds.value = [item.id];
  }
};

const downloadSelected = async () => {
  const fileItems = props.items.filter(i => selectedItemIds.value.includes(i.id) && i.type === 'FILE');
  for (const item of fileItems) {
    await downloadFile(item);
  }
};

const handleDeleteSelected = () => {
  if (selectedItemIds.value.length === 0) return;
  emit('delete', [...selectedItemIds.value]);
  selectedItemIds.value = [];
};

const startRename = (item: FileNode, event: Event) => {
  event.stopPropagation();
  renamingId.value = item.id;
  renameValue.value = item.name;
};

const saveRename = () => {
  if (renamingId.value && renameValue.value.trim() !== '') {
    const item = props.items.find(i => i.id === renamingId.value);
    if (item && item.name === renameValue.value.trim()) {
      cancelRename();
      return;
    }
    emit('rename', renamingId.value, renameValue.value.trim());
  }
  cancelRename();
};

const cancelRename = () => {
  renamingId.value = null;
  renameValue.value = '';
};

const handleDelete = (itemId: string, event?: Event) => {
  if (event) event.stopPropagation();
  emit('delete', itemId);
  selectedItemIds.value = selectedItemIds.value.filter(id => id !== itemId);
};

const handleDragStart = (e: DragEvent, itemId: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', itemId);
    e.dataTransfer.effectAllowed = 'move';
  }
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const shareLinks = ref<Record<string, string>>({});

const generateShareLink = async (item: FileNode) => {
  try {
    const res = await fetch('/api/v1/shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${props.authToken}`
      },
      body: JSON.stringify({ nodeId: item.id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Failed to create share link');
      return;
    }
    const shareUrl = `${window.location.origin}/?shareId=${data.data.id}`;
    shareLinks.value[item.id] = shareUrl;
  } catch (err) {
    console.error('Error sharing:', err);
    alert('Error generating share link');
  }
};

const generateAndCopyShareLink = async (item: FileNode) => {
  try {
    const res = await fetch('/api/v1/shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${props.authToken}`
      },
      body: JSON.stringify({ nodeId: item.id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Failed to create share link');
      return;
    }
    const shareUrl = `${window.location.origin}/?shareId=${data.data.id}`;
    shareLinks.value[item.id] = shareUrl;
    await navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  } catch (err) {
    console.error('Error sharing:', err);
    alert('Error generating share link');
  }
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  alert('Share link copied to clipboard!');
};

const selectTextInput = (event: Event) => {
  const target = event.currentTarget as HTMLInputElement;
  if (target) {
    target.select();
  }
};

const selectedItemDetails = computed(() => {
  if (!selectedItemId.value) return null;
  return props.items.find(i => i.id === selectedItemId.value) || null;
});

const activePreviewFile = ref<FileNode | null>(null);


const isImageFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '');
};

const isVideoFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext || '');
};

const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  item: FileNode | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  item: null
});

const handleContextMenu = (e: MouseEvent, item: FileNode | null) => {
  e.preventDefault();
  e.stopPropagation();
  
  if (item) {
    if (!selectedItemIds.value.includes(item.id)) {
      selectedItemIds.value = [item.id];
    }
  }
  
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    item
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

onMounted(() => {
  window.addEventListener('click', closeContextMenu);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
});
</script>

<template>
  <div 
    class="flex-1 flex flex-col min-w-0 h-full bg-slate-900/40"
    @contextmenu.prevent="handleContextMenu($event, null)"
  >
    <div class="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0 bg-slate-950/20">
      <div class="text-sm font-semibold text-slate-400">
        {{ items.length }} {{ items.length === 1 ? 'item' : 'items' }} found
      </div>
      
      <div class="flex bg-slate-950/60 p-1 rounded-lg border border-slate-800">
        <button 
          @click="viewMode = 'grid'" 
          :class="['p-1.5 rounded transition-all', viewMode === 'grid' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white']"
          title="Grid view"
        >
          <LayoutGrid class="w-4 h-4" />
        </button>
        <button 
          @click="viewMode = 'list'" 
          :class="['p-1.5 rounded transition-all', viewMode === 'list' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white']"
          title="List view"
        >
          <List class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden min-h-0">
      <div class="flex-1 overflow-y-auto p-6 min-w-0">
        <div v-if="items.length === 0" class="h-full flex flex-col items-center justify-center text-center p-8">
          <div class="w-20 h-20 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center mb-4">
            <span class="text-4xl">📂</span>
          </div>
          <h3 class="text-lg font-bold text-slate-300">This folder is empty</h3>
          <p class="text-sm text-slate-500 max-w-xs mt-1">Use the actions panel above to create new folders or upload custom assets.</p>
        </div>

        <template v-else>
          <div 
            v-if="viewMode === 'grid'"
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            <div
              v-for="item in items"
              :key="item.id"
              :draggable="userRole !== 'VIEWER'"
              @dragstart="handleDragStart($event, item.id)"
              @click="handleSelectItem(item, $event)"
              @dblclick="handleDoubleClick(item)"
              @contextmenu.prevent.stop="handleContextMenu($event, item)"
              :class="[
                'group relative flex flex-col items-center p-4 rounded-xl cursor-pointer border transition-all duration-150',
                selectedItemIds.includes(item.id) 
                  ? 'bg-brand-600/10 border-brand-500 shadow-md shadow-brand-500/5' 
                  : 'bg-slate-900/30 hover:bg-slate-800/40 border-slate-800/60 hover:border-slate-700',
                item.isVisible === false ? 'opacity-60' : ''
              ]"
            >
              <!-- Selection Checkbox -->
              <div 
                class="absolute top-2.5 left-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                :class="{ 'opacity-100': selectedItemIds.includes(item.id) }"
                @click.stop="toggleSingleSelect(item)"
              >
                <div 
                  class="w-4 h-4 rounded border flex items-center justify-center transition-colors duration-150"
                  :class="[
                    selectedItemIds.includes(item.id)
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-slate-950/80 border-slate-700 hover:border-slate-500 text-transparent'
                  ]"
                >
                  <Check class="w-3 h-3 stroke-[3]" />
                </div>
              </div>

              <div 
                v-if="item.type === 'FOLDER'"
                class="w-14 h-14 rounded-xl flex items-center justify-center text-amber-500 bg-amber-500/10 mb-3 shadow-inner"
              >
                <Folder class="w-8 h-8 fill-amber-500/20" />
              </div>
              <div 
                v-else
                :class="['w-14 h-14 rounded-xl flex items-center justify-center mb-3 shadow-inner', getFileIconClass(item.name)]"
              >
                <component :is="getFileIcon(item.name)" class="w-7 h-7" />
              </div>

              <div class="w-full text-center">
                <div v-if="renamingId === item.id" class="flex gap-1 items-center mt-1">
                  <input
                    v-model="renameValue"
                    @click.stop
                    @keydown.enter="saveRename"
                    @keydown.esc="cancelRename"
                    class="w-full px-2 py-1 text-xs bg-slate-950 border border-brand-500 rounded text-slate-100 focus:outline-none"
                    ref="renameInput"
                  />
                  <button @click.stop="saveRename" class="p-1 text-emerald-400 hover:text-emerald-300">
                    <Check class="w-3.5 h-3.5" />
                  </button>
                  <button @click.stop="cancelRename" class="p-1 text-red-400 hover:text-red-300">
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>
                <div v-else class="text-sm font-medium truncate text-slate-200 group-hover:text-white px-1">
                  {{ item.name }}
                  <span v-if="item.isVisible === false" class="text-[10px] text-slate-500/80 italic font-normal ml-0.5 lowercase">(hidden)</span>
                </div>
              </div>

              <div v-if="userRole !== 'VIEWER'" class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  @click="startRename(item, $event)" 
                  class="p-1.5 rounded-lg bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-brand-300 transition-colors"
                  title="Rename"
                >
                  <Edit3 class="w-3 h-3" />
                </button>
                <button 
                  @click="handleDelete(item.id, $event)" 
                  class="p-1.5 rounded-lg bg-slate-950/80 hover:bg-red-950 border border-slate-800 text-slate-400 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="glass-card rounded-xl overflow-hidden border border-slate-800">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th class="py-3 px-4 w-10">
                    <div 
                      class="w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors"
                      :class="[
                        items.length > 0 && items.every(i => selectedItemIds.includes(i.id))
                          ? 'bg-brand-600 border-brand-500 text-white'
                          : 'bg-slate-950/80 border-slate-700 hover:border-slate-500 text-transparent'
                      ]"
                      @click="toggleSelectAll"
                    >
                      <Check class="w-3 h-3 stroke-[3]" />
                    </div>
                  </th>
                  <th class="py-3 px-4">Name</th>
                  <th class="py-3 px-4">Type</th>
                  <th class="py-3 px-4">Modified</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/50 text-sm text-slate-300">
                <tr
                  v-for="item in items"
                  :key="item.id"
                  :draggable="userRole !== 'VIEWER'"
                  @dragstart="handleDragStart($event, item.id)"
                  @click="handleSelectItem(item, $event)"
                  @dblclick="handleDoubleClick(item)"
                  @contextmenu.prevent.stop="handleContextMenu($event, item)"
                  :class="[
                    'group cursor-pointer transition-colors',
                    selectedItemIds.includes(item.id) ? 'bg-brand-600/10' : 'hover:bg-slate-800/40',
                    item.isVisible === false ? 'opacity-60' : ''
                  ]"
                >
                  <td class="py-3 px-4 w-10" @click.stop>
                    <div 
                      class="w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors"
                      :class="[
                        selectedItemIds.includes(item.id)
                          ? 'bg-brand-600 border-brand-500 text-white'
                          : 'bg-slate-950/80 border-slate-700 hover:border-slate-500 text-transparent opacity-0 group-hover:opacity-100'
                      ]"
                      @click="toggleSingleSelect(item)"
                    >
                      <Check class="w-3 h-3 stroke-[3]" />
                    </div>
                  </td>
                  <td class="py-3 px-4 flex items-center gap-3">
                    <Folder v-if="item.type === 'FOLDER'" class="w-5 h-5 text-amber-500 fill-amber-500/10" />
                    <component v-else :is="getFileIcon(item.name)" :class="['w-5 h-5', getFileIconClass(item.name).split(' ')[0]]" />
                    
                    <div v-if="renamingId === item.id" class="flex gap-1 items-center" @click.stop>
                      <input
                        v-model="renameValue"
                        @keydown.enter="saveRename"
                        @keydown.esc="cancelRename"
                        class="px-2 py-1 text-xs bg-slate-950 border border-brand-500 rounded text-slate-100 focus:outline-none"
                      />
                      <button @click="saveRename" class="p-1 text-emerald-400">
                        <Check class="w-3.5 h-3.5" />
                      </button>
                      <button @click="cancelRename" class="p-1 text-red-400">
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span v-else class="font-medium truncate max-w-md text-slate-200 group-hover:text-white">
                      {{ item.name }}
                      <span v-if="item.isVisible === false" class="text-[10px] text-slate-500/80 italic font-normal ml-1 lowercase">(hidden)</span>
                    </span>
                  </td>
                  
                  <td class="py-3 px-4 text-slate-400">
                    {{ item.type === 'FOLDER' ? 'Folder' : item.name.split('.').pop()?.toUpperCase() + ' File' }}
                  </td>
                  
                  <td class="py-3 px-4 text-slate-400">
                    {{ formatDate(item.updatedAt) }}
                  </td>
                  
                  <td class="py-3 px-4 text-right">
                    <div v-if="userRole !== 'VIEWER'" class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        @click="startRename(item, $event)" 
                        class="p-1.5 rounded-lg hover:bg-slate-850 text-slate-400 hover:text-brand-300 transition-colors"
                      >
                        <Edit3 class="w-3.5 h-3.5" />
                      </button>
                      <button 
                        @click="handleDelete(item.id, $event)" 
                        class="p-1.5 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

      <div 
        v-if="showProperties"
        class="w-80 border-l border-slate-800/80 bg-slate-950/40 p-6 flex flex-col gap-6 animate-fade-in shrink-0 overflow-y-auto hidden md:flex"
      >
        <div class="flex items-center justify-between shrink-0">
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-400">Properties</h3>
          <button @click="emit('toggle-properties')" class="text-slate-500 hover:text-slate-300">
            <X class="w-4 h-4" />
          </button>
        </div>

        <template v-if="selectedItemIds.length > 1">
          <div class="flex flex-col items-center gap-2 p-6 rounded-2xl bg-slate-900/50 border border-slate-850 text-center shadow-inner">
            <div class="w-20 h-20 rounded-2xl flex items-center justify-center text-brand-400 bg-brand-500/10 shadow-inner">
              <Folder class="w-12 h-12 fill-brand-500/10" />
            </div>
            <h4 class="text-md font-bold text-slate-200 mt-2">
              {{ selectedItemIds.length }} items selected
            </h4>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 uppercase">
              Batch Selection
            </span>
          </div>

          <div class="space-y-3 text-xs flex-1">
            <div class="text-slate-400 font-semibold mb-2">Selected items list:</div>
            <ul class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              <li 
                v-for="id in selectedItemIds" 
                :key="id"
                class="flex items-center gap-2 p-1.5 rounded bg-slate-950/30 border border-slate-850 truncate text-slate-300"
              >
                <Folder v-if="props.items.find(i => i.id === id)?.type === 'FOLDER'" class="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <File v-else class="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <span class="truncate">{{ props.items.find(i => i.id === id)?.name || 'Unknown item' }}</span>
              </li>
            </ul>
          </div>

          <div class="mt-auto space-y-2 shrink-0">
            <button 
              v-if="props.items.some(i => selectedItemIds.includes(i.id) && i.type === 'FILE')"
              @click="downloadSelected"
              class="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors mb-2"
            >
              <Download class="w-4 h-4" /> Download Selected Files
            </button>
            <button 
              v-if="userRole !== 'VIEWER'"
              @click="handleDeleteSelected"
              class="w-full py-2 bg-red-950/30 hover:bg-red-950/60 border border-red-500/20 text-red-300 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 class="w-4 h-4" /> Delete Selected
            </button>
          </div>
        </template>

        <template v-else-if="selectedItemDetails">
          <div class="flex flex-col items-center gap-2 p-6 rounded-2xl bg-slate-900/50 border border-slate-850 text-center shadow-inner">
            <div 
              v-if="selectedItemDetails.type === 'FOLDER'"
              class="w-20 h-20 rounded-2xl flex items-center justify-center text-amber-500 bg-amber-500/10 shadow-inner"
            >
              <Folder class="w-12 h-12 fill-amber-500/10" />
            </div>
            <div 
              v-else
              :class="['w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner', getFileIconClass(selectedItemDetails.name)]"
            >
              <component :is="getFileIcon(selectedItemDetails.name)" class="w-10 h-10" />
            </div>
            <h4 class="text-md font-bold text-slate-200 mt-2 truncate w-full px-2">{{ selectedItemDetails.name }}</h4>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 uppercase">
              {{ selectedItemDetails.type }}
            </span>
          </div>

          <div class="space-y-4 text-xs">
            <div class="flex justify-between border-b border-slate-850 pb-2.5">
              <span class="text-slate-500 flex items-center gap-1.5">
                <Calendar class="w-3.5 h-3.5" /> Created
              </span>
              <span class="text-slate-300 font-medium text-right">{{ formatDate(selectedItemDetails.createdAt) }}</span>
            </div>

            <div class="flex justify-between border-b border-slate-850 pb-2.5">
              <span class="text-slate-500 flex items-center gap-1.5">
                <Calendar class="w-3.5 h-3.5" /> Updated
              </span>
              <span class="text-slate-300 font-medium text-right">{{ formatDate(selectedItemDetails.updatedAt) }}</span>
            </div>

            <div class="flex justify-between border-b border-slate-850 pb-2.5">
              <span class="text-slate-500 flex items-center gap-1.5">
                <User class="w-3.5 h-3.5" /> Owner ID
              </span>
              <span class="text-slate-300 font-mono text-right truncate w-40" :title="selectedItemDetails.ownerId">
                {{ selectedItemDetails.ownerId }}
              </span>
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-slate-500 flex items-center gap-1.5">
                <ExternalLink class="w-3.5 h-3.5" /> Materialized Path (Ancestry)
              </span>
              <span 
                class="text-[10px] font-mono bg-slate-950 p-2 rounded border border-slate-850 text-slate-400 break-all leading-relaxed mt-1"
              >
                {{ selectedItemDetails.ancestry || 'None (Root Node)' }}
              </span>
            </div>

            <div v-if="userRole === 'MEMBER'" class="flex flex-col gap-1.5 border-t border-slate-850 pt-2.5">
              <span class="text-slate-500 flex items-center gap-1.5">
                🔗 Share Node
              </span>
              <div class="flex gap-2 mt-1">
                <button
                  @click="generateShareLink(selectedItemDetails)"
                  class="flex-1 py-2 bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/20 text-brand-300 font-semibold rounded-lg text-center transition-all duration-200"
                >
                  Generate Share Link
                </button>
              </div>
              <div v-if="shareLinks[selectedItemDetails.id]" class="flex gap-1.5 mt-1.5">
                <input
                  :value="shareLinks[selectedItemDetails.id]"
                  readonly
                  class="flex-1 px-2.5 py-1 text-[11px] bg-slate-950 border border-slate-800 rounded text-slate-400 focus:outline-none"
                  @click="selectTextInput"
                />
                <button
                  @click="copyToClipboard(shareLinks[selectedItemDetails.id])"
                  class="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[10px] font-bold transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div class="mt-auto space-y-2 shrink-0">
            <button 
              v-if="selectedItemDetails.type === 'FILE'"
              @click="downloadFile(selectedItemDetails)"
              class="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors mb-2"
            >
              <Download class="w-4 h-4" /> Download File
            </button>
            <button 
              v-if="userRole !== 'VIEWER'"
              @click="startRename(selectedItemDetails, $event)"
              class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 border border-slate-750 transition-colors"
            >
              <Edit3 class="w-4 h-4" /> Rename Node
            </button>
            <button 
              v-if="userRole !== 'VIEWER'"
              @click="handleDelete(selectedItemDetails.id, $event)"
              class="w-full py-2 bg-red-950/30 hover:bg-red-950/60 border border-red-500/20 text-red-300 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 class="w-4 h-4" /> Delete Node
            </button>
          </div>
        </template>
        <template v-else>
          <div class="flex-1 flex flex-col items-center justify-center gap-4 text-center p-6 text-slate-500">
            <div class="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-850 flex items-center justify-center text-slate-400 shadow-inner">
              <LayoutGrid class="w-7 h-7" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-350">No Selection</h4>
              <p class="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-[200px]">Select a file or folder to view its properties and metadata.</p>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Custom Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="fixed z-50 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-xl py-1.5 w-48 text-xs font-semibold text-slate-300"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <template v-if="selectedItemIds.length > 1">
        <button
          v-if="props.items.some(i => selectedItemIds.includes(i.id) && i.type === 'FILE')"
          @click="downloadSelected(); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
        >
          <span>📥</span> Download Selected
        </button>
        <button
          v-if="userRole !== 'VIEWER'"
          @click="handleDeleteSelected(); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-red-950/40 hover:text-red-400 text-red-400/80 flex items-center gap-2 border-t border-slate-850 mt-1 pt-2"
        >
          <span>🗑️</span> Delete Selected
        </button>
      </template>
      <template v-else-if="contextMenu.item">
        <button
          @click="handleDoubleClick(contextMenu.item); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
        >
          <span>📂</span> Open
        </button>
        <button
          v-if="contextMenu.item.type === 'FILE'"
          @click="downloadFile(contextMenu.item); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
        >
          <span>📥</span> Download
        </button>
        <button
          v-if="userRole === 'MEMBER'"
          @click="generateAndCopyShareLink(contextMenu.item); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
        >
          <span>🔗</span> Copy Share Link
        </button>
        <button
          v-if="userRole !== 'VIEWER'"
          @click="startRename(contextMenu.item, $event); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
        >
          <span>✏️</span> Rename
        </button>
        <button
          v-if="userRole !== 'VIEWER'"
          @click="handleDelete(contextMenu.item.id, $event); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-red-950/40 hover:text-red-400 text-red-400/80 flex items-center gap-2 border-t border-slate-850 mt-1 pt-2"
        >
          <span>🗑️</span> Delete
        </button>
      </template>
      <template v-else>
        <button
          v-if="userRole !== 'VIEWER'"
          @click="emit('create-node', 'FOLDER'); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-slate-800 hover:text-white flex items-center gap-2"
        >
          <span>📁</span> New Folder
        </button>
        <button
          v-if="userRole !== 'VIEWER'"
          @click="emit('create-node', 'FILE'); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-slate-800 hover:text-white flex items-center gap-2"
        >
          <span>📄</span> New File
        </button>
        <button
          @click="emit('refresh'); closeContextMenu()"
          class="w-full text-left px-4 py-2 hover:bg-slate-800 hover:text-white flex items-center gap-2 border-t border-slate-850 mt-1 pt-2"
        >
          <span>🔄</span> Refresh
        </button>
      </template>
    </div>

    <!-- File Preview Modal -->
    <div
      v-if="activePreviewFile"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6"
      @click="closePreview"
    >
      <div
        class="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[85vh] h-full flex flex-col shadow-2xl overflow-hidden"
        @click.stop
      >
        <div class="h-14 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div class="flex items-center gap-2.5">
            <span class="text-lg">📄</span>
            <span class="font-bold text-slate-200 text-sm">{{ activePreviewFile.name }}</span>
          </div>
          <button
            @click="closePreview"
            class="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-950/20">
          <div v-if="loadingPreview" class="flex flex-col items-center gap-2">
            <Loader2 class="w-8 h-8 animate-spin text-brand-500" />
            <span class="text-xs text-slate-400">Loading preview...</span>
          </div>
          <template v-else>
            <img
              v-if="isImageFile(activePreviewFile.name) && previewUrl"
              :src="previewUrl"
              alt="Preview"
              class="max-h-full max-w-full object-contain rounded-xl shadow-lg border border-slate-800/50"
            />

            <video
              v-else-if="isVideoFile(activePreviewFile.name) && previewUrl"
              controls
              autoplay
              class="max-h-full max-w-full rounded-xl shadow-lg border border-slate-800/50"
              :src="previewUrl"
            >
              Your browser does not support the video tag.
            </video>

            <pre
              v-else-if="textPreviewContent !== ''"
              class="w-full h-full p-6 font-mono text-xs text-slate-300 overflow-auto bg-slate-950/60 rounded-xl border border-slate-850/80 leading-relaxed select-text"
            >{{ textPreviewContent }}</pre>

            <div v-else class="text-slate-400 text-sm">
              No preview available for this file type.
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
