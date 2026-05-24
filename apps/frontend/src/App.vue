<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, provide } from 'vue';
import { 
  FolderPlus, 
  FilePlus, 
  Search, 
  LogOut, 
  ChevronRight,
  HardDrive,
  User,
  Shield,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-vue-next';
import AuthModal from './components/AuthModal.vue';
import FolderTree from './components/FolderTree.vue';
import ContentView from './components/ContentView.vue';

interface FileNode {
  id: string;
  name: string;
  type: 'FOLDER' | 'FILE';
  parentId: string | null;
  ownerId: string;
  ancestry: string;
  createdAt: string;
  updatedAt: string;
  isVisible?: boolean;
}

const authToken = ref(localStorage.getItem('dt_token') || '');
const currentUser = ref<{ email: string; role: string } | null>(null);
const showProperties = ref(false);


const rootFolders = ref<FileNode[]>([]);
const localRootFolders = ref<FileNode[]>([]);
const folderNameMap = ref<Map<string, string>>(new Map());
const folderAncestryMap = ref<Map<string, string>>(new Map());


const selectedFolderId = ref<string | null>(null); 
const selectedFolderName = ref('Inventory');
const currentContents = ref<FileNode[]>([]);
const loadingContents = ref(false);
const loadingTree = ref(false);


const searchQuery = ref('');
const searchResults = ref<FileNode[]>([]);
const isSearchMode = ref(false);
const searchCache = new Map<string, FileNode[]>();
let debounceTimer: any = null;


const isCreating = ref(false);
const createType = ref<'FOLDER' | 'FILE'>('FOLDER');
const createName = ref('');
const selectedUploadFile = ref<File | null>(null);
const createError = ref('');
const creatingLoading = ref(false);


const treeRef = ref<any>(null);

const activeAlertMessage = ref<string | null>(null);

const confirmDialog = ref<{ message: string; resolve: (val: boolean) => void } | null>(null);
const showConfirm = (message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    confirmDialog.value = { message, resolve };
  });
};
const resolveConfirm = (value: boolean) => {
  if (confirmDialog.value) {
    confirmDialog.value.resolve(value);
    confirmDialog.value = null;
  }
};

const treeRefreshTrigger = ref<string | null>(null);
provide('treeRefreshTrigger', treeRefreshTrigger);

const triggerFolderTreeRefresh = (folderId: string | null) => {
  if (!folderId) return;
  treeRefreshTrigger.value = folderId;
  setTimeout(() => {
    if (treeRefreshTrigger.value === folderId) {
      treeRefreshTrigger.value = null;
    }
  }, 100);
};

const registerFolders = (folders: FileNode[]) => {
  folders.forEach(node => {
    if (node.type === 'FOLDER') {
      folderNameMap.value.set(node.id, node.name);
      folderAncestryMap.value.set(node.id, node.ancestry);
    }
  });
};
provide('registerFolders', registerFolders);

const isLocalMode = computed(() => {
  return selectedFolderId.value === 'local-root' || (selectedFolderId.value?.startsWith('local://') ?? false);
});

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedUploadFile.value = target.files[0];
    createName.value = target.files[0].name;
  }
};

const isRenaming = ref(false);
const renameItemId = ref('');
const renameItemName = ref('');
const renameItemError = ref('');
const renamingLoading = ref(false);

const openRenameDialog = (item: FileNode) => {
  renameItemId.value = item.id;
  renameItemName.value = item.name;
  renameItemError.value = '';
  isRenaming.value = true;
};

const submitRename = async () => {
  if (renameItemName.value.trim() === '') {
    renameItemError.value = 'Name cannot be empty';
    return;
  }
  
  const origName = folderNameMap.value.get(renameItemId.value);
  if (origName === renameItemName.value.trim()) {
    isRenaming.value = false;
    return;
  }
  
  renamingLoading.value = true;
  renameItemError.value = '';
  
  try {
    const res = await fetch(`/api/v1/nodes/${renameItemId.value}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`
      },
      body: JSON.stringify({ name: renameItemName.value.trim() })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to rename item');
    }
    
    isRenaming.value = false;
    searchCache.clear();
    
    const parentId = data.data.parentId;
    triggerFolderTreeRefresh(parentId);
    
    if (selectedFolderId.value === renameItemId.value) {
      selectedFolderName.value = renameItemName.value.trim();
    }
    
    await fetchFolderContents(selectedFolderId.value, selectedFolderName.value);
    await fetchRootFolders();
  } catch (err: any) {
    renameItemError.value = err.message || 'Rename failed';
  } finally {
    renamingLoading.value = false;
  }
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

const handleTreeContextMenu = (e: MouseEvent, node: any) => {
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    item: node
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

onMounted(() => {
  window.alert = (message: string) => {
    activeAlertMessage.value = message;
  };
  window.addEventListener('click', closeContextMenu);

  const storedUser = localStorage.getItem('dt_user');
  if (storedUser) {
    currentUser.value = JSON.parse(storedUser);
  }
  if (authToken.value) {
    initApp();
  }
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('click', closeContextMenu);
});


watch(searchQuery, (newQuery) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  if (newQuery.trim() === '') {
    isSearchMode.value = false;
    searchResults.value = [];
  } else {
    isSearchMode.value = true;
    
    const isLocal = isLocalMode.value;
    const term = newQuery.trim().toLowerCase();
    const key = `${isLocal ? 'local' : 'db'}:${term}`;
    
    if (searchCache.has(key)) {
      searchResults.value = searchCache.get(key) || [];
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      await performSearch();
    }, 250);
  }
});

const handleAuthenticated = (token: string, user: { email: string; role: string }) => {
  authToken.value = token;
  currentUser.value = user;
  initApp();
};

const activeShareNode = ref<FileNode | null>(null);

const handleActiveShare = async (shareId: string) => {
  try {
    const res = await fetch(`/api/v1/shares/${shareId}`, {
      headers: { 'Authorization': `Bearer ${authToken.value}` }
    });
    if (res.ok) {
      const data = await res.json();
      const payload = data.data;
      
      const node: FileNode = {
        id: payload.nodeId,
        name: payload.nodeName,
        type: payload.nodeType,
        parentId: payload.parentId,
        ownerId: '',
        ancestry: payload.ancestry,
        createdAt: payload.createdAt,
        updatedAt: payload.createdAt
      };

      activeShareNode.value = node;

      if (node.type === 'FOLDER') {
        rootFolders.value = [node];
        registerFolders([node]);
        await fetchFolderContents(node.id, node.name);
      } else {
        rootFolders.value = [];
        currentContents.value = [node];
      }
    } else {
      console.error('Failed to fetch share link');
      activeShareNode.value = null;
      rootFolders.value = [];
      currentContents.value = [];
    }
  } catch (err) {
    console.error('Error fetching active share:', err);
    activeShareNode.value = null;
    rootFolders.value = [];
    currentContents.value = [];
  }
};

const handleLogout = () => {
  localStorage.removeItem('dt_token');
  localStorage.removeItem('dt_user');
  authToken.value = '';
  currentUser.value = null;
  rootFolders.value = [];
  localRootFolders.value = [];
  currentContents.value = [];
  selectedFolderId.value = null;
  selectedFolderName.value = 'Inventory';
  searchCache.clear();
  activeShareNode.value = null;
};

const initApp = async () => {
  searchCache.clear();
  loadingTree.value = true;

  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('shareId');

  if (currentUser.value?.role === 'VIEWER') {
    if (shareId) {
      await handleActiveShare(shareId);
    } else {
      rootFolders.value = [];
      currentContents.value = [];
    }
  } else {
    await fetchRootFolders();
    if (selectedFolderId.value === null || !selectedFolderId.value.startsWith('local')) {
      await fetchFolderContents(null, 'Inventory');
    } else {
      await fetchFolderContents(selectedFolderId.value, selectedFolderName.value);
    }
  }
  loadingTree.value = false;
};

const fetchRootFolders = async () => {
  try {
    const res = await fetch('/api/v1/nodes/roots', {
      headers: { 'Authorization': `Bearer ${authToken.value}` }
    });
    if (res.ok) {
      const data = await res.json();
      const payload = data.data;
      rootFolders.value = payload;
      registerFolders(payload);
    }
  } catch (err) {
    console.error('Failed to fetch root folders:', err);
  }
};

const fetchFolderContents = async (folderId: string | null, folderName: string) => {
  loadingContents.value = true;
  selectedFolderId.value = folderId;
  selectedFolderName.value = folderName;
  
  const idParam = folderId || 'root';
  try {
    const res = await fetch(`/api/v1/nodes/${idParam}/contents`, {
      headers: { 'Authorization': `Bearer ${authToken.value}` }
    });
    if (res.ok) {
      const data = await res.json();
      const payload = data.data;
      currentContents.value = payload;
      registerFolders(payload);
    }
  } catch (err) {
    console.error('Failed to fetch folder contents:', err);
  } finally {
    loadingContents.value = false;
  }
};

const navigateToFolder = async (folderId: string | null, folderName: string) => {
  searchQuery.value = '';
  await fetchFolderContents(folderId, folderName);
};

const performSearch = async () => {
  const queryVal = searchQuery.value.trim();
  if (!queryVal) return;
  
  const isLocal = isLocalMode.value;
  const term = queryVal.toLowerCase();
  const key = `${isLocal ? 'local' : 'db'}:${term}`;
  
  if (searchCache.has(key)) {
    searchResults.value = searchCache.get(key) || [];
    return;
  }
  
  try {
    const url = `/api/v1/nodes/search?q=${encodeURIComponent(queryVal)}${isLocal ? '&mode=local' : ''}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${authToken.value}` }
    });
    if (res.ok) {
      const data = await res.json();
      const payload = data.data;
      searchResults.value = payload;
      searchCache.set(key, payload);
      registerFolders(payload);
    }
  } catch (err) {
    console.error('Search error:', err);
  }
};


const openCreateDialog = (type: 'FOLDER' | 'FILE') => {
  createType.value = type;
  createName.value = '';
  selectedUploadFile.value = null;
  createError.value = '';
  isCreating.value = true;
};

const submitCreate = async () => {
  if (createName.value.trim() === '') {
    createError.value = 'Name cannot be empty';
    return;
  }
  
  creatingLoading.value = true;
  createError.value = '';

  try {
    let res;
    if (createType.value === 'FILE' && selectedUploadFile.value) {
      const formData = new FormData();
      formData.append('name', createName.value.trim());
      formData.append('type', 'FILE');
      formData.append('parentId', selectedFolderId.value || '');
      formData.append('file', selectedUploadFile.value);

      res = await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken.value}`
        },
        body: formData
      });
    } else {
      res = await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken.value}`
        },
        body: JSON.stringify({
          name: createName.value.trim(),
          type: createType.value,
          parentId: selectedFolderId.value
        })
      });
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to create item');
    }

    isCreating.value = false;
    searchCache.clear();
    await fetchFolderContents(selectedFolderId.value, selectedFolderName.value);
    await fetchRootFolders();
    triggerFolderTreeRefresh(selectedFolderId.value);
  } catch (err: any) {
    createError.value = err.message || 'Creation failed';
  } finally {
    creatingLoading.value = false;
  }
};

const handleDeleteNode = async (itemIdOrIds: string | string[]) => {
  const isMultiple = Array.isArray(itemIdOrIds);
  const count = isMultiple ? itemIdOrIds.length : 1;
  const message = isMultiple
    ? `Are you sure you want to delete the ${count} selected items?`
    : 'Are you sure you want to delete this item? Folders will be soft-deleted recursively.';

  const confirmDelete = await showConfirm(message);
  if (!confirmDelete) return;

  try {
    const ids = isMultiple ? itemIdOrIds : [itemIdOrIds];
    for (const id of ids) {
      const res = await fetch(`/api/v1/nodes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken.value}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || 'Failed to delete item');
        break;
      }
    }

    searchCache.clear();
    await fetchFolderContents(selectedFolderId.value, selectedFolderName.value);
    await fetchRootFolders();
    triggerFolderTreeRefresh(selectedFolderId.value);
  } catch (err) {
    console.error('Failed to delete node:', err);
  }
};

const handleRenameNode = async (itemId: string, newName: string) => {
  try {
    const res = await fetch(`/api/v1/nodes/${itemId}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`
      },
      body: JSON.stringify({ name: newName })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || 'Failed to rename item');
      return;
    }

    searchCache.clear();
    await fetchFolderContents(selectedFolderId.value, selectedFolderName.value);
    await fetchRootFolders();
    folderNameMap.value.set(itemId, newName);
    triggerFolderTreeRefresh(selectedFolderId.value);
  } catch (err) {
    console.error('Failed to rename node:', err);
  }
};

const isDragOverRoot = ref(false);
const handleDragOverRoot = (e: DragEvent) => {
  e.preventDefault();
  isDragOverRoot.value = true;
};
const handleDropOnRoot = async (e: DragEvent) => {
  e.preventDefault();
  isDragOverRoot.value = false;
  
  if (!e.dataTransfer) return;
  const draggedNodeId = e.dataTransfer.getData('text/plain');
  if (!draggedNodeId) return;

  try {
    const draggedEl = document.querySelector(`[data-id="${draggedNodeId}"]`);
    const oldParentId = draggedEl?.getAttribute('data-parent-id') || null;

    const res = await fetch(`/api/v1/nodes/${draggedNodeId}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`
      },
      body: JSON.stringify({
        destinationFolderId: null 
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || 'Failed to move node to root');
      return;
    }

    searchCache.clear();
    await fetchFolderContents(selectedFolderId.value, selectedFolderName.value);
    await fetchRootFolders();
    if (oldParentId) {
      triggerFolderTreeRefresh(oldParentId);
    }
  } catch (err) {
    console.error('Error dropping to root:', err);
  }
};

const breadcrumbs = computed(() => {
  if (currentUser.value?.role === 'VIEWER' && activeShareNode.value) {
    const shareRootId = activeShareNode.value.id;
    const shareRootName = activeShareNode.value.name;

    if (selectedFolderId.value === shareRootId) {
      return [{ id: shareRootId, name: shareRootName }];
    }

    const ancestry = selectedFolderId.value ? (folderAncestryMap.value.get(selectedFolderId.value) || '') : '';
    const parts = ancestry.split('/').filter(Boolean);
    const rootIndex = parts.indexOf(shareRootId);
    
    let visibleParts = parts;
    if (rootIndex !== -1) {
      visibleParts = parts.slice(rootIndex);
    }

    const list = visibleParts.map(id => ({
      id,
      name: id === shareRootId ? shareRootName : (folderNameMap.value.get(id) || 'Folder')
    }));

    list.push({ id: selectedFolderId.value as any, name: selectedFolderName.value });
    
    const uniqueList: typeof list = [];
    const seenIds = new Set<string | null>();
    for (const item of list) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueList.push(item);
      }
    }
    return uniqueList;
  }

  const isLocal = isLocalMode.value;
  const rootId = isLocal ? 'local-root' : null;
  const rootName = isLocal ? 'Local Disk' : 'Inventory';

  if (!selectedFolderId.value || selectedFolderId.value === 'local-root') {
    return [{ id: rootId, name: rootName }];
  }
  
  const ancestry = folderAncestryMap.value.get(selectedFolderId.value) || '';
  const parts = ancestry.split('/').filter(Boolean);
  const list: { id: string | null; name: string }[] = parts.map(id => ({
    id: id === 'local-root' ? 'local-root' : id,
    name: id === 'local-root' ? 'Local Disk' : (folderNameMap.value.get(id) || 'Folder')
  }));
  
  if (list.length > 0 && (list[0].id === null || list[0].id === 'local-root')) {
    list[0].name = rootName;
    list[0].id = rootId;
  } else {
    list.unshift({ id: rootId, name: rootName });
  }

  list.push({ id: selectedFolderId.value as any, name: selectedFolderName.value });
  
  const uniqueList: typeof list = [];
  const seenIds = new Set<string | null>();
  for (const item of list) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      uniqueList.push(item);
    }
  }
  return uniqueList;
});

const handleKeyDown = (e: KeyboardEvent) => {
  if (
    document.activeElement?.tagName === 'INPUT' || 
    document.activeElement?.tagName === 'TEXTAREA' ||
    document.querySelector('.auth-modal-dialog')
  ) {
    return;
  }

  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if (!keys.includes(e.key)) return;

  e.preventDefault();

  const items = Array.from(document.querySelectorAll('.tree-node-item')) as HTMLElement[];
  const currentId = selectedFolderId.value === null ? 'root' : selectedFolderId.value;
  const currentIndex = items.findIndex(item => item.getAttribute('data-id') === currentId);

  if (e.key === 'ArrowDown') {
    const nextIndex = currentIndex + 1;
    if (nextIndex < items.length) {
      const nextItem = items[nextIndex];
      const nextId = nextItem.getAttribute('data-id');
      const nextName = nextItem.getAttribute('data-name');
      fetchFolderContents(nextId === 'root' ? null : nextId, nextName || 'Folder');
      nextItem.scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'ArrowUp') {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const prevItem = items[prevIndex];
      const prevId = prevItem.getAttribute('data-id');
      const prevName = prevItem.getAttribute('data-name');
      fetchFolderContents(prevId === 'root' ? null : prevId, prevName || 'Folder');
      prevItem.scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'ArrowRight') {
    if (currentIndex >= 0) {
      const currentItem = items[currentIndex];
      const expandBtn = currentItem.querySelector('.expand-btn') as HTMLElement;
      const isOpenAttr = currentItem.getAttribute('data-open');
      if (expandBtn && isOpenAttr === 'false') {
        expandBtn.click();
      }
    }
  } else if (e.key === 'ArrowLeft') {
    if (currentIndex >= 0) {
      const currentItem = items[currentIndex];
      const expandBtn = currentItem.querySelector('.expand-btn') as HTMLElement;
      const isOpenAttr = currentItem.getAttribute('data-open');
      if (expandBtn && isOpenAttr === 'true') {
        expandBtn.click();
      } else {
        const parentId = currentItem.getAttribute('data-parent-id');
        if (parentId !== null) {
          const parentItem = items.find(item => item.getAttribute('data-id') === (parentId === '' ? 'root' : parentId));
          if (parentItem) {
            const pId = parentItem.getAttribute('data-id');
            const pName = parentItem.getAttribute('data-name');
            fetchFolderContents(pId === 'root' ? null : pId, pName || 'Folder');
            parentItem.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    }
  }
};
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-slate-950 font-sans flex flex-col">
    
    <AuthModal v-if="!authToken" @authenticated="handleAuthenticated" />

    <template v-else>
      
      <header class="h-16 border-b border-slate-900 bg-slate-950/60 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-10">
        
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow shadow-brand-500/10">
            <span class="text-lg">🌐</span>
          </div>
          <span class="font-display font-extrabold text-lg bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent hidden sm:inline-block">
            Dot Traveler
          </span>
        </div>

        
        <div class="w-full max-w-md mx-4 relative">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search files and folders..."
            class="w-full pl-10 pr-4 py-2 rounded-full glass-input text-sm"
          />
        </div>

        
        <div class="flex items-center gap-4">
          <div class="hidden md:flex flex-col items-end text-right">
            <span class="text-xs font-semibold text-slate-300 flex items-center gap-1">
              <User class="w-3 h-3 text-brand-400" /> {{ currentUser?.email }}
            </span>
            <span class="text-[10px] font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1">
              <Shield class="w-2.5 h-2.5" /> {{ currentUser?.role.replace('_', ' ') }}
            </span>
          </div>
          
          <button 
            @click="showProperties = !showProperties"
            :class="[
              'p-2 rounded-xl border transition-all duration-200',
              showProperties 
                ? 'bg-brand-600/20 border-brand-500 text-brand-300' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            ]"
            title="Toggle Properties Panel"
          >
            <Info class="w-4 h-4" />
          </button>

          <button 
            @click="handleLogout"
            class="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-red-950/20 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-all duration-200"
            title="Log Out"
          >
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </header>

      
      <div class="flex-1 flex overflow-hidden min-h-0">
        
        
        <aside class="w-72 border-r border-slate-900 bg-slate-950/40 p-4 flex flex-col gap-4 shrink-0 hidden sm:flex">
          
          
          <div v-if="currentUser?.role !== 'VIEWER'" class="flex gap-2">
            <button
              @click="openCreateDialog('FOLDER')"
              class="flex-1 py-2 px-3 rounded-xl bg-brand-600/10 hover:bg-brand-600/20 border border-brand-500/20 text-brand-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <FolderPlus class="w-3.5 h-3.5" /> Folder
            </button>
            <button
              @click="openCreateDialog('FILE')"
              class="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <FilePlus class="w-3.5 h-3.5" /> File
            </button>
          </div>

          
          <div class="h-px bg-slate-900 my-1"></div>

          
          <div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 px-2">
            <span>Folders Tree</span>
            <button @click="initApp" class="hover:text-white transition-colors" title="Reload Directory">
              <RefreshCw :class="['w-3.5 h-3.5', loadingTree ? 'animate-spin' : '']" />
            </button>
          </div>

          
          <div class="flex-1 overflow-y-auto pr-1 space-y-1">
            
            <div
              @click="navigateToFolder(null, 'Inventory')"
              @dragover="handleDragOverRoot"
              @dragleave="isDragOverRoot = false"
              @drop="handleDropOnRoot"
              class="tree-node-item"
              data-id="root"
              data-name="Inventory"
              data-open="true"
              data-parent-id=""
              :class="[
                'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                selectedFolderId === null 
                  ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500 pl-1.5' 
                  : 'text-slate-400 hover:bg-slate-900/50 hover:text-white',
                isDragOverRoot ? 'bg-brand-500/20 border-2 border-dashed border-brand-500 py-1.5' : ''
              ]"
            >
              <HardDrive class="w-4 h-4 text-brand-400" />
              <span class="text-sm">Inventory</span>
            </div>

            <div v-if="rootFolders.length > 0" class="pl-1 mt-2">
              <FolderTree
                v-for="node in rootFolders"
                :key="node.id"
                :node="node"
                :selectedId="selectedFolderId"
                :authToken="authToken"
                :userRole="currentUser?.role"
                @select="navigateToFolder"
                @node-moved="initApp"
                @contextmenu="handleTreeContextMenu"
                ref="treeRef"
              />
            </div>
            
            <div v-else-if="loadingTree" class="flex justify-center p-8">
              <Loader2 class="w-5 h-5 text-brand-500 animate-spin" />
            </div>

            <div v-else class="text-center p-6 text-xs text-slate-600 italic">
              No directories created
            </div>


          </div>
        </aside>

        
        <main class="flex-1 flex flex-col min-w-0 h-full">
          
          
          <div class="h-14 border-b border-slate-900 px-6 flex items-center gap-2 shrink-0 bg-slate-950/30">
            
            <div class="flex items-center flex-wrap gap-1.5 text-sm font-medium">
              <template v-for="(bc, index) in breadcrumbs" :key="bc.id || 'root'">
                <button
                  @click="navigateToFolder(bc.id, bc.name)"
                  :class="[
                    'hover:text-white transition-colors duration-150',
                    index === breadcrumbs.length - 1 ? 'text-slate-100 font-bold' : 'text-slate-400'
                  ]"
                >
                  {{ bc.name }}
                </button>
                <ChevronRight v-if="index < breadcrumbs.length - 1" class="w-4 h-4 text-slate-650 shrink-0" />
              </template>
            </div>
          </div>

          
          <div class="flex-1 flex min-h-0 relative">
            <div v-if="loadingContents" class="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 backdrop-blur-xs">
              <Loader2 class="w-10 h-10 text-brand-500 animate-spin" />
            </div>
            
            <ContentView
              :items="isSearchMode ? searchResults : currentContents"
              :selectedFolderId="selectedFolderId"
              :authToken="authToken"
              :showProperties="showProperties"
              :userRole="currentUser?.role"
              @navigate="navigateToFolder"
              @delete="handleDeleteNode"
              @rename="handleRenameNode"
              @node-moved="initApp"
              @toggle-properties="showProperties = !showProperties"
              @create-node="openCreateDialog"
              @refresh="initApp"
            />
          </div>
        </main>
      </div>

      
      <div v-if="isCreating" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm animate-fade-in" @click="isCreating = false">
        <div class="w-full max-w-sm p-6 rounded-2xl glass-panel shadow-2xl border border-slate-800" @click.stop>
          <h3 class="text-md font-bold text-slate-200 mb-4">
            Create New {{ createType === 'FOLDER' ? 'Folder' : 'File' }}
          </h3>

          <div v-if="createError" class="p-2 mb-3 bg-red-950/40 border border-red-500/20 text-red-200 text-xs rounded-lg">
            {{ createError }}
          </div>

          <form @submit.prevent="submitCreate">
            <div v-if="createType === 'FILE'" class="mb-4">
              <label class="block text-xs text-slate-400 mb-1">Select File</label>
              <input
                type="file"
                @change="handleFileChange"
                required
                class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-350 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-brand-600/20 file:text-brand-300 hover:file:bg-brand-600/30"
              />
            </div>

            <div class="mb-4">
              <label class="block text-xs text-slate-400 mb-1">Name</label>
              <input
                v-model="createName"
                type="text"
                placeholder="Enter name..."
                required
                class="w-full px-3 py-2 rounded-lg glass-input text-sm"
                autofocus
              />
            </div>

            <div class="flex justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                @click="isCreating = false"
                class="px-4 py-2 border border-slate-850 bg-slate-900 text-slate-400 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="creatingLoading"
                class="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <span v-if="creatingLoading" class="animate-spin text-xs">⏳</span>
                Create
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Custom Alert Modal -->
      <div v-if="activeAlertMessage !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xs animate-fade-in" @click="activeAlertMessage = null">
        <div class="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl animate-scale-up" @click.stop>
          <div class="flex items-center gap-3 text-red-400 mb-3 shrink-0">
            <span class="text-2xl">⚠️</span>
            <h3 class="text-md font-bold text-slate-200">Alert</h3>
          </div>
          <p class="text-sm text-slate-350 leading-relaxed mb-5 select-text">{{ activeAlertMessage }}</p>
          <div class="flex justify-end">
            <button
              @click="activeAlertMessage = null"
              class="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-lg hover:shadow-brand-500/20"
            >
              OK
            </button>
          </div>
        </div>
      </div>

      <!-- Custom Confirm Modal -->
      <div v-if="confirmDialog !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xs animate-fade-in" @click="resolveConfirm(false)">
        <div class="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl animate-scale-up" @click.stop>
          <div class="flex items-center gap-3 text-brand-400 mb-3 shrink-0">
            <span class="text-2xl">❓</span>
            <h3 class="text-md font-bold text-slate-200">Confirm Action</h3>
          </div>
          <p class="text-sm text-slate-350 leading-relaxed mb-5 select-text">{{ confirmDialog.message }}</p>
          <div class="flex justify-end gap-2.5 text-xs font-semibold">
            <button
              @click="resolveConfirm(false)"
              class="px-4 py-2 border border-slate-850 bg-slate-900 text-slate-400 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="resolveConfirm(true)"
              class="px-4 py-2 bg-red-650 hover:bg-red-550 text-white rounded-lg transition-colors shadow-lg hover:shadow-red-500/20"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Custom Context Menu for Tree Folders -->
      <div
        v-if="contextMenu.visible"
        class="fixed z-50 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-xl py-1.5 w-48 text-xs font-semibold text-slate-300"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @click.stop
      >
        <template v-if="contextMenu.item">
          <button
            @click="navigateToFolder(contextMenu.item.id, contextMenu.item.name); closeContextMenu()"
            class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
          >
            <span>📂</span> Open
          </button>
          <button
            v-if="currentUser?.role !== 'VIEWER'"
            @click="openRenameDialog(contextMenu.item); closeContextMenu()"
            class="w-full text-left px-4 py-2 hover:bg-brand-650 hover:text-white flex items-center gap-2"
          >
            <span>✏️</span> Rename
          </button>
          <button
            v-if="currentUser?.role !== 'VIEWER'"
            @click="handleDeleteNode(contextMenu.item.id); closeContextMenu()"
            class="w-full text-left px-4 py-2 hover:bg-red-950/40 hover:text-red-400 text-red-400/80 flex items-center gap-2 border-t border-slate-850 mt-1 pt-2"
          >
            <span>🗑️</span> Delete
          </button>
        </template>
      </div>

      <!-- Custom Rename Dialog Modal -->
      <div v-if="isRenaming" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs animate-fade-in" @click="isRenaming = false">
        <div class="w-full max-w-sm p-6 rounded-2xl glass-panel shadow-2xl border border-slate-800" @click.stop>
          <h3 class="text-md font-bold text-slate-200 mb-4">
            Rename Folder
          </h3>

          <div v-if="renameItemError" class="p-2 mb-3 bg-red-950/40 border border-red-500/20 text-red-200 text-xs rounded-lg">
            {{ renameItemError }}
          </div>

          <form @submit.prevent="submitRename">
            <div class="mb-4">
              <label class="block text-xs text-slate-400 mb-1">New Name</label>
              <input
                v-model="renameItemName"
                type="text"
                required
                class="w-full px-3 py-2 rounded-lg glass-input text-sm"
                autofocus
              />
            </div>

            <div class="flex justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                @click="isRenaming = false"
                class="px-4 py-2 border border-slate-850 bg-slate-900 text-slate-400 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="renamingLoading"
                class="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <span v-if="renamingLoading" class="animate-spin text-xs">⏳</span>
                Rename
              </button>
            </div>
          </form>
        </div>
      </div>
    </template>
  </div>
</template>
