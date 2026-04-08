// Proxmox VE and PBS API Types

// ===== Proxmox VE Types =====

export interface ProxmoxNode {
    node: string;
    status: 'online' | 'offline' | 'unknown';
    cpu?: number;           // CPU usage fraction (0–1)
    maxcpu?: number;        // Number of CPUs
    mem?: number;           // Used memory (bytes)
    maxmem?: number;        // Total memory (bytes)
    disk?: number;          // Used disk (bytes)
    maxdisk?: number;       // Total disk (bytes)
    uptime?: number;        // Uptime in seconds
    level?: string;         // Support level
    id?: string;
    type?: string;
}

export interface ProxmoxVM {
    vmid: number;
    name?: string;
    status: 'running' | 'stopped' | 'paused' | 'suspended';
    type: 'qemu' | 'lxc';
    node: string;
    cpu?: number;           // CPU usage fraction
    cpus?: number;          // Number of vCPUs
    mem?: number;           // Used memory (bytes)
    maxmem?: number;        // Allocated memory (bytes)
    disk?: number;          // Used disk (bytes)
    maxdisk?: number;       // Allocated disk (bytes)
    uptime?: number;        // Uptime in seconds
    netin?: number;
    netout?: number;
    diskread?: number;
    diskwrite?: number;
    template?: number;      // 1 if this is a template
    tags?: string;
    pool?: string;
}

export interface ProxmoxStorage {
    storage: string;
    type: string;
    status?: string;
    active?: number;
    enabled?: number;
    shared?: number;
    avail?: number;
    used?: number;
    total?: number;
    content?: string;       // Comma-separated list: images,rootdir,vztmpl,backup,iso,snippets
    nodes?: string;
}

export interface ProxmoxClusterStatus {
    id: string;
    name?: string;
    type: 'cluster' | 'node';
    online?: number;
    nodes?: number;
    quorate?: number;
    version?: number;
}

export interface ProxmoxTask {
    upid: string;
    node: string;
    pid?: number;
    pstart?: number;
    starttime: number;
    endtime?: number;
    type: string;
    id?: string;
    user: string;
    status?: string;
    exitstatus?: string;
}

export interface ProxmoxApiResponse<T> {
    data: T;
}

export interface ProxmoxNodesResponse {
    data: ProxmoxNode[];
}

export interface ProxmoxVMsResponse {
    data: ProxmoxVM[];
}

export interface ProxmoxStorageResponse {
    data: ProxmoxStorage[];
}

// ===== Proxmox Backup Server Types =====

export interface PBSDatastore {
    name: string;
    path?: string;
    'avail'?: number;       // Available space (bytes)
    'used'?: number;        // Used space (bytes)
    'total'?: number;       // Total space (bytes)
    'gc-status'?: PBSGCStatus;
}

export interface PBSGCStatus {
    upid?: string;
    'disk-bytes'?: number;
    'index-count'?: number;
    'removed-bytes'?: number;
    'removed-chunks'?: number;
    'pending-bytes'?: number;
    'pending-chunks'?: number;
    dedup?: number;
}

export interface PBSBackupGroup {
    'backup-type': 'vm' | 'ct' | 'host';
    'backup-id': string;
    'last-backup': number;  // Unix timestamp
    'backup-count': number;
    owner?: string;
}

export interface PBSSnapshot {
    'backup-type': 'vm' | 'ct' | 'host';
    'backup-id': string;
    'backup-time': number;  // Unix timestamp
    size?: number;
    files?: PBSSnapshotFile[];
    owner?: string;
    protected?: boolean;
    comment?: string;
}

export interface PBSSnapshotFile {
    filename: string;
    size?: number;
    'crypt-mode'?: string;
}

export interface PBSTask {
    upid: string;
    node: string;
    pid?: number;
    pstart?: number;
    starttime: number;
    endtime?: number;
    type: string;
    id?: string;
    user: string;
    status?: string;
    exitstatus?: string;
}

export interface PBSNodeStatus {
    uptime?: number;
    memory?: {
        used: number;
        total: number;
        free: number;
    };
    swap?: {
        used: number;
        total: number;
        free: number;
    };
    cpu?: number;
    cpuinfo?: {
        cpus: number;
        model: string;
        cores: number;
        sockets: number;
    };
    kversion?: string;
    version?: string;
}

export interface PBSApiResponse<T> {
    data: T;
}

// Summary types for UI display

export interface ProxmoxSummary {
    nodeCount: number;
    onlineNodes: number;
    vmCount: number;
    runningVMs: number;
    containerCount: number;
    runningContainers: number;
    totalCPUs: number;
    cpuUsage: number;       // fraction 0–1
    totalMemory: number;    // bytes
    usedMemory: number;     // bytes
}

export interface PBSSummary {
    datastoreCount: number;
    totalSpace: number;     // bytes
    usedSpace: number;      // bytes
    availSpace: number;     // bytes
    recentTasks: PBSTask[];
    successfulTasks: number;
    failedTasks: number;
}
