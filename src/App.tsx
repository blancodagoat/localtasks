import { useState, useEffect, useCallback, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Shield, Download, ClipboardList, Check, AlertTriangle, Menu, X } from "lucide-react";

interface Task {
  id: number;
  title: string;
  completed: boolean;
  list_id: number;
  created_at: string;
}

interface TaskList {
  id: number;
  name: string;
}

function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [activeList, setActiveList] = useState<number>(1);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showAddList, setShowAddList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const initDb = useCallback(async () => {
    try {
      const database = await Database.load("sqlite:localtasks.db");

      await database.execute(`
        CREATE TABLE IF NOT EXISTS lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      await database.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          completed INTEGER DEFAULT 0,
          list_id INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (list_id) REFERENCES lists(id)
        )
      `);

      const listsData = await database.select<TaskList[]>("SELECT * FROM lists ORDER BY id");

      if (listsData.length === 0) {
        await database.execute("INSERT INTO lists (name) VALUES ('Personal')");
        await database.execute("INSERT INTO lists (name) VALUES ('Work')");
        const refreshed = await database.select<TaskList[]>("SELECT * FROM lists ORDER BY id");
        setLists(refreshed);
        setActiveList(refreshed[0]?.id ?? 1);
      } else {
        setLists(listsData);
        setActiveList(listsData[0]?.id ?? 1);
      }

      setDb(database);
      setLoading(false);
    } catch (err) {
      console.error("Failed to initialize database:", err);
      setInitError("Can't reach your local database. Your tasks aren't being saved.");
      setLoading(false);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await initDb();
    })();
    return () => { cancelled = true; };
  }, [initDb]);

  const retryInit = useCallback(() => {
    setIsRetrying(true);
    setInitError(null);
    void initDb();
  }, [initDb]);

  useEffect(() => {
    if (!db) return;
    let isMounted = true;
    const currentDb = db;

    async function loadTasks() {
      try {
        const tasksData = await currentDb.select<Task[]>(
          "SELECT * FROM tasks WHERE list_id = ? ORDER BY completed ASC, created_at DESC",
          [activeList]
        );
        if (isMounted) setTasks(tasksData);
      } catch (err) {
        if (isMounted) {
          console.error("Failed to load tasks:", err);
          setError("Failed to load tasks");
        }
      }
    }

    loadTasks();

    return () => { isMounted = false; };
  }, [db, activeList]);

  const { completedCount, totalCount, progressPercent } = useMemo(() => {
    const completed = tasks.filter(t => t.completed).length;
    const total = tasks.length;
    return {
      completedCount: completed,
      totalCount: total,
      progressPercent: total > 0 ? (completed / total) * 100 : 0
    };
  }, [tasks]);

  const activeListName = useMemo(
    () => lists.find(l => l.id === activeList)?.name || "Tasks",
    [lists, activeList]
  );

  const handleAddTask = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !db || actionLoading) return;

    setActionLoading(true);
    const tempId = Date.now();
    try {
      setTasks(prev => [...prev, {
        id: tempId,
        title: newTaskTitle.trim(),
        completed: false,
        list_id: activeList,
        created_at: new Date().toISOString()
      }]);
      setNewTaskTitle("");

      await db.execute(
        "INSERT INTO tasks (title, list_id) VALUES (?, ?)",
        [newTaskTitle.trim(), activeList]
      );

      const insertedTasks = await db.select<Task[]>(
        "SELECT * FROM tasks WHERE list_id = ? ORDER BY id DESC LIMIT 1",
        [activeList]
      );
      if (insertedTasks.length > 0) {
        const realTask = insertedTasks[0];
        setTasks(prev => prev.map(t => t.id === tempId ? realTask : t));
      }
    } catch (err) {
      console.error("Failed to add task:", err);
      setError("Failed to add task");
      try {
        const tasksData = await db.select<Task[]>(
          "SELECT * FROM tasks WHERE list_id = ? ORDER BY completed ASC, created_at DESC",
          [activeList]
        );
        setTasks(tasksData);
      } catch {
        // Recovery failed, tasks may be stale
      }
    } finally {
      setActionLoading(false);
    }
  }, [newTaskTitle, db, activeList, actionLoading]);

  const handleToggleTask = useCallback(async (id: number, completed: boolean) => {
    if (!db) return;

    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !completed } : t
    ));

    try {
      await db.execute(
        "UPDATE tasks SET completed = ? WHERE id = ?",
        [!completed ? 1 : 0, id]
      );
    } catch (err) {
      console.error("Failed to toggle task:", err);
      setError("Failed to update task");
      setTasks(prev => prev.map(t =>
        t.id === id ? { ...t, completed } : t
      ));
    }
  }, [db]);

  const handleDeleteTask = useCallback(async (id: number) => {
    if (!db) return;
    setActionLoading(true);

    let previousTasks: Task[] = [];
    setTasks(prev => {
      previousTasks = [...prev];
      return prev.filter(t => t.id !== id);
    });

    try {
      await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
    } catch (err) {
      console.error("Failed to delete task:", err);
      setError("Failed to delete task");
      setTasks(previousTasks);
    }
    setActionLoading(false);
  }, [db]);

  const handleAddList = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !db) return;

    try {
      await db.execute("INSERT INTO lists (name) VALUES (?)", [newListName.trim()]);
      const listsData = await db.select<TaskList[]>("SELECT * FROM lists ORDER BY id");
      setLists(listsData);
      setNewListName("");
      setShowAddList(false);
    } catch (err) {
      console.error("Failed to add list:", err);
      setError("Failed to add list");
    }
  }, [newListName, db]);

  const handleDeleteList = useCallback(async (id: number) => {
    if (!db || lists.length <= 1) return;

    try {
      await db.execute("DELETE FROM tasks WHERE list_id = ?", [id]);
      await db.execute("DELETE FROM lists WHERE id = ?", [id]);

      const listsData = await db.select<TaskList[]>("SELECT * FROM lists ORDER BY id");
      setLists(listsData);
      if (activeList === id) {
        setActiveList(listsData[0].id);
      }
    } catch (err) {
      console.error("Failed to delete list:", err);
      setError("Failed to delete list");
    }
  }, [db, lists, activeList]);

  const handleExportData = useCallback(async () => {
    if (!db) return;

    try {
      const [allTasks, allLists] = await Promise.all([
        db.select<Task[]>("SELECT * FROM tasks"),
        db.select<TaskList[]>("SELECT * FROM lists")
      ]);

      const data = {
        version: 1,
        exported_at: new Date().toISOString(),
        lists: allLists,
        tasks: allTasks,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `localtasks-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export data:", err);
      setError("Failed to export data");
    }
  }, [db]);

  // Transient errors (toggle/add/delete) auto-dismiss after 5s.
  // initError is persistent — user must retry to clear it.
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSelectList = useCallback((id: number) => {
    setActiveList(id);
    // Close sidebar on mobile after selecting a list (single-handed op)
    setIsSidebarOpen(false);
  }, []);

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  // Sidebar content reused in loading + ready states
  const sidebarHeader = (
    <div className="p-4 border-b border-surface-border flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-privacy-green" />
          <span className="font-semibold text-text-primary">LocalTasks</span>
        </div>
        <p className="text-xs text-text-muted mt-1">Private &amp; offline</p>
      </div>
      <button
        type="button"
        onClick={closeSidebar}
        className="md:hidden text-text-muted hover:text-text-secondary"
        aria-label="Close sidebar"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-screen">
        <aside className="hidden md:flex w-56 bg-surface-card border-r border-surface-border flex-col">
          <div className="p-4 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-gray-300" />
              <span className="font-semibold text-text-primary">LocalTasks</span>
            </div>
            <p className="text-xs text-text-muted mt-1">Private &amp; offline</p>
          </div>

          <nav className="flex-1 p-2 overflow-y-auto">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider px-2 mb-2">
              Lists
            </div>
            <div className="space-y-2 px-2" aria-hidden="true">
              <div className="h-8 bg-gray-200 rounded animate-pulse" />
              <div className="h-8 bg-gray-200 rounded animate-pulse w-4/5" />
              <div className="h-8 bg-gray-200 rounded animate-pulse w-3/5" />
            </div>
          </nav>

          <div className="p-4 border-t border-surface-border">
            <div className="h-9 bg-gray-200 rounded-lg animate-pulse" aria-hidden="true" />
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-surface-card border-b border-surface-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-6 bg-gray-200 rounded animate-pulse w-40 mb-2" aria-hidden="true" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-24" aria-hidden="true" />
              </div>
              <div className="privacy-badge">
                <Check className="w-3 h-3" />
                <span>Offline Only</span>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
              <div className="h-full bg-gray-200 animate-pulse" style={{ width: "30%" }} />
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6" aria-busy="true" aria-live="polite">
            <div className="mb-6 flex gap-2">
              <div className="h-10 flex-1 bg-gray-200 rounded-lg animate-pulse" />
              <div className="h-10 w-16 bg-gray-200 rounded-lg animate-pulse" />
            </div>
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="card flex items-center gap-3"
                  aria-hidden="true"
                >
                  <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                  <div className={`h-4 bg-gray-200 rounded animate-pulse ${
                    i === 0 ? "w-3/4" : i === 1 ? "w-1/2" : i === 2 ? "w-2/3" : "w-5/6"
                  }`} />
                </div>
              ))}
            </div>
          </div>

          <footer className="bg-surface-card border-t border-surface-border px-6 py-3">
            <p className="text-xs text-text-muted text-center flex items-center justify-center gap-1">
              <Shield className="w-3.5 h-3.5" /> All data stored locally
            </p>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${
          isSidebarOpen
            ? "fixed inset-y-0 left-0 z-50 flex"
            : "hidden md:flex"
        } w-56 bg-surface-card border-r border-surface-border flex-col`}
      >
        {sidebarHeader}

        <nav className="flex-1 p-2 overflow-y-auto">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider px-2 mb-2">
            Lists
          </div>
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => handleSelectList(list.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (lists.length > 1 && window.confirm(`Delete "${list.name}" and all its tasks?`)) {
                  handleDeleteList(list.id);
                }
              }}
              aria-pressed={activeList === list.id}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activeList === list.id
                  ? "bg-privacy-light text-privacy-green font-medium"
                  : "text-text-secondary hover:bg-gray-50"
              }`}
            >
              {list.name}
            </button>
          ))}

          {showAddList ? (
            <form onSubmit={handleAddList} className="px-2 mt-2">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name..."
                className="input text-sm"
                autoFocus
              />
              <div className="flex gap-1 mt-1">
                <button type="submit" className="btn-primary text-xs py-1 px-2">
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddList(false)}
                  className="btn-secondary text-xs py-1 px-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddList(true)}
              className="w-full text-left px-3 py-2 text-sm text-text-muted hover:text-text-secondary"
            >
              + New List
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-surface-border">
          <button onClick={handleExportData} className="btn-secondary w-full text-sm">
            <Download className="w-4 h-4" /> Export Data
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-surface-card border-b border-surface-border px-4 md:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden text-text-secondary hover:text-text-primary flex-shrink-0"
                aria-label="Open sidebar"
                aria-expanded={isSidebarOpen}
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-xl font-semibold text-text-primary truncate">
                  {activeListName}
                </h1>
                <p className="text-sm text-text-secondary">
                  {completedCount} of {totalCount} completed
                </p>
              </div>
            </div>
            <div className="privacy-badge flex-shrink-0">
              <Check className="w-3 h-3" />
              <span>Offline Only</span>
            </div>
          </div>

          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-privacy-green transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </header>

        {initError && (
          <div
            role="alert"
            className="bg-red-50 border-b border-red-200 text-red-700 px-4 md:px-6 py-3 flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="flex-1 text-sm">{initError}</p>
            <button
              type="button"
              onClick={retryInit}
              disabled={isRetrying}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {isRetrying ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}

        {error && !initError && (
          <div
            role="alert"
            className="bg-red-50 border-b border-red-200 text-red-700 px-4 md:px-6 py-3 flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="flex-1 text-sm">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <form onSubmit={handleAddTask} className="mb-6 flex gap-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add a new task..."
              className="input flex-1 min-w-0"
              aria-label="New task title"
            />
            <button type="submit" className="btn-primary flex-shrink-0" disabled={actionLoading}>
              {actionLoading ? "..." : "Add"}
            </button>
          </form>

          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-text-secondary">No tasks yet</p>
              <p className="text-sm text-text-muted mt-1">
                Add your first task above
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`card flex items-center gap-3 group ${
                    task.completed ? "opacity-60" : ""
                  }`}
                >
                  <button
                    onClick={() => handleToggleTask(task.id, task.completed)}
                    aria-label={task.completed ? "Mark as incomplete" : "Mark as complete"}
                    aria-pressed={task.completed}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-privacy-green focus:ring-offset-2 ${
                      task.completed
                        ? "bg-privacy-green border-privacy-green"
                        : "border-gray-300 hover:border-privacy-green"
                    }`}
                  >
                    {task.completed && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  <span className={`flex-1 min-w-0 break-words ${
                    task.completed ? "line-through text-text-muted" : "text-text-primary"
                  }`}>
                    {task.title}
                  </span>

                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    aria-label="Delete task"
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 transition-all focus:opacity-100 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="bg-surface-card border-t border-surface-border px-6 py-3">
          <p className="text-xs text-text-muted text-center flex items-center justify-center gap-1">
            <Shield className="w-3.5 h-3.5" /> All data stored locally
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
