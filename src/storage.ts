import {
  taskColors,
  type PlannerSettings,
  type SomedayList,
  type Task,
  type TaskEdits,
} from "./model";
import { samePlacement, validPlacement } from "./placement";

const databaseName = "yourweek";
const schemaVersion = 2;

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Запись отменена"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Ошибка хранилища"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class PlannerStorage {
  private constructor(private readonly database: IDBDatabase) {}

  static async open(): Promise<PlannerStorage> {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, schemaVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("tasks")) {
          const tasks = database.createObjectStore("tasks", { keyPath: "id" });
          tasks.createIndex("date", "placement.date");
          const lists = database.createObjectStore("lists", { keyPath: "id" });
          ["Входящие", "Личное", "Идеи"].forEach((title, order) => {
            lists.add({ id: crypto.randomUUID(), title, order });
          });
        }
        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings");
        }
        if (!database.objectStoreNames.contains("navigation")) {
          database.createObjectStore("navigation");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Закройте другие вкладки YourWeek и повторите"));
    });
    database.onversionchange = () => database.close();
    return new PlannerStorage(database);
  }

  async readSettings(): Promise<PlannerSettings> {
    const transaction = this.database.transaction("settings", "readonly");
    const done = transactionDone(transaction);
    const [settings] = await Promise.all([
      requestResult<PlannerSettings | undefined>(
        transaction.objectStore("settings").get("planner"),
      ),
      done,
    ]);
    return settings ?? { weekStartsOn: 1 };
  }

  async saveSettings(settings: PlannerSettings): Promise<void> {
    const transaction = this.database.transaction("settings", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("settings").put(settings, "planner");
    await done;
  }

  async readSelectedWeek(): Promise<string | undefined> {
    const transaction = this.database.transaction("navigation", "readonly");
    const done = transactionDone(transaction);
    const [date] = await Promise.all([
      requestResult<string | undefined>(
        transaction.objectStore("navigation").get("selectedWeek"),
      ),
      done,
    ]);
    return date;
  }

  async saveSelectedWeek(date: string): Promise<void> {
    const transaction = this.database.transaction("navigation", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("navigation").put(date, "selectedWeek");
    await done;
  }

  async readWeek(firstDate: string, lastDate: string): Promise<Task[]> {
    const transaction = this.database.transaction("tasks", "readonly");
    const done = transactionDone(transaction);
    const [tasks] = await Promise.all([
      requestResult<Task[]>(
        transaction
          .objectStore("tasks")
          .index("date")
          .getAll(IDBKeyRange.bound(firstDate, lastDate)),
      ),
      done,
    ]);
    return tasks.sort((a, b) => a.order - b.order);
  }

  async readLists(): Promise<SomedayList[]> {
    const transaction = this.database.transaction("lists", "readonly");
    const done = transactionDone(transaction);
    const [lists] = await Promise.all([
      requestResult<SomedayList[]>(transaction.objectStore("lists").getAll()),
      done,
    ]);
    return lists.sort((a, b) => a.order - b.order);
  }

  createList(title: string): Promise<SomedayList> {
    return this.writeList(title);
  }

  renameList(id: string, title: string): Promise<SomedayList> {
    return this.writeList(title, id);
  }

  private async writeList(title: string, id?: string): Promise<SomedayList> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("Введите непустое название списка");
    const transaction = this.database.transaction("lists", "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore("lists");
    let list: SomedayList;
    let error: Error | undefined;
    const request = store.getAll();
    request.onsuccess = () => {
      const lists: SomedayList[] = request.result;
      const existing = lists.find((list) => list.id === id);
      if (id !== undefined && !existing) {
        error = new Error("Список не найден");
      } else if (
        lists.some(
          (list) =>
            list.id !== id &&
            list.title.trim().toLowerCase() === trimmedTitle.toLowerCase(),
        )
      ) {
        error = new Error("Список с таким названием уже существует");
      }
      if (error) {
        transaction.abort();
        return;
      }
      list = existing
        ? { ...existing, title: trimmedTitle }
        : {
            id: crypto.randomUUID(),
            title: trimmedTitle,
            order: Math.max(-1, ...lists.map((list) => list.order)) + 1,
          };
      store.put(list);
    };
    try {
      await done;
    } catch (failure) {
      throw error ?? failure;
    }
    return list!;
  }

  async deleteList(id: string): Promise<void> {
    const transaction = this.database.transaction(
      ["lists", "tasks"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const store = transaction.objectStore("lists");
    let error: Error | undefined;
    const request = store.getAll();
    request.onsuccess = () => {
      const lists: SomedayList[] = request.result;
      const tasks = transaction.objectStore("tasks").getAll();
      tasks.onsuccess = () => {
        if (lists.length <= 1) {
          error = new Error("Нельзя удалить последний список");
        } else if (
          (tasks.result as Task[]).some((task) => task.placement.listId === id)
        ) {
          error = new Error(
            "Нельзя удалить список с задачами. Сначала удалите или перенесите задачи.",
          );
        }
        if (error) transaction.abort();
        else store.delete(id);
      };
    };
    try {
      await done;
    } catch (failure) {
      throw error ?? failure;
    }
  }

  async readListTasks(): Promise<Task[]> {
    const transaction = this.database.transaction("tasks", "readonly");
    const done = transactionDone(transaction);
    const [tasks] = await Promise.all([
      requestResult<Task[]>(transaction.objectStore("tasks").getAll()),
      done,
    ]);
    return tasks
      .filter((task) => task.placement.listId !== undefined)
      .sort((a, b) => a.order - b.order);
  }

  async createListTask(title: string, listId: string): Promise<Task> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("Введите название задачи");
    const transaction = this.database.transaction(
      ["tasks", "lists"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const store = transaction.objectStore("tasks");
    let task: Task;
    const list = transaction.objectStore("lists").get(listId);
    list.onsuccess = () => {
      if (!list.result) {
        transaction.abort();
        return;
      }
      const request = store.getAll();
      request.onsuccess = () => {
        const tasks = (request.result as Task[]).filter(
          (task) => task.placement.listId === listId,
        );
        task = {
          id: crypto.randomUUID(),
          title: trimmedTitle,
          completed: false,
          placement: { listId },
          order: Math.max(-1, ...tasks.map((task) => task.order)) + 1,
        };
        store.add(task);
      };
    };
    await done;
    return task!;
  }

  async createTask(title: string, date: string): Promise<Task> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("Введите название задачи");
    const transaction = this.database.transaction("tasks", "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore("tasks");
    return new Promise<Task>((resolve, reject) => {
      const request = store.index("date").getAll(date);
      let task: Task;
      request.onsuccess = () => {
        const tasks: Task[] = request.result;
        task = {
          id: crypto.randomUUID(),
          title: trimmedTitle,
          completed: false,
          placement: { date },
          order: Math.max(-1, ...tasks.map((task) => task.order)) + 1,
        };
        store.add(task);
      };
      done.then(() => resolve(task), reject);
    });
  }
  async updateTask(id: string, edits: Partial<TaskEdits>): Promise<Task> {
    if (edits.title !== undefined && !edits.title.trim()) {
      throw new Error("Введите название задачи");
    }
    if (edits.color !== undefined && !Object.hasOwn(taskColors, edits.color)) {
      throw new Error("Выберите цвет из палитры");
    }
    const transaction = this.database.transaction(
      ["tasks", "lists"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const store = transaction.objectStore("tasks");
    let task: Task;
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) {
        transaction.abort();
        return;
      }
      const existing: Task = request.result;
      const placement = edits.placement ?? existing.placement;
      const write = () => {
        const all = store.getAll();
        all.onsuccess = () => {
          task = { ...existing, ...edits };
          if (edits.title !== undefined) task.title = edits.title.trim();
          if (!samePlacement(placement, existing.placement)) {
            const container = (all.result as Task[]).filter((entry) =>
              samePlacement(entry.placement, placement),
            );
            task.order =
              Math.max(-1, ...container.map((entry) => entry.order)) + 1;
          }
          store.put(task);
        };
      };
      if (!validPlacement(placement)) {
        transaction.abort();
      } else if (placement.listId !== undefined) {
        const list = transaction.objectStore("lists").get(placement.listId);
        list.onsuccess = () => {
          if (list.result) write();
          else transaction.abort();
        };
      } else write();
    };
    await done;
    return task!;
  }

  async reorderTask(
    id: string,
    targetId: string,
    position: "before" | "after",
    hideCompleted: boolean,
  ): Promise<Task[]> {
    const transaction = this.database.transaction("tasks", "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore("tasks");
    let changed: Task[] = [];
    const request = store.getAll();
    request.onsuccess = () => {
      const all: Task[] = request.result;
      const task = all.find((entry) => entry.id === id);
      const target = all.find((entry) => entry.id === targetId);
      if (
        !task ||
        !target ||
        !samePlacement(task.placement, target.placement) ||
        (hideCompleted && (task.completed || target.completed))
      ) {
        transaction.abort();
        return;
      }
      const container = all
        .filter((entry) => samePlacement(entry.placement, task.placement))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const visible = container.filter(
        (entry) => !hideCompleted || !entry.completed,
      );
      const slots = visible.map((entry) => entry.order);
      const reordered = visible.filter((entry) => entry.id !== id);
      const index = reordered.findIndex((entry) => entry.id === targetId);
      if (id === targetId) return;
      reordered.splice(index + (position === "after" ? 1 : 0), 0, task);
      changed = reordered.map((entry, index) => ({
        ...entry,
        order: slots[index],
      }));
      changed.forEach((entry) => store.put(entry));
    };
    await done;
    return changed;
  }

  async deleteTask(id: string): Promise<void> {
    const transaction = this.database.transaction("tasks", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("tasks").delete(id);
    await done;
  }

  async readHideCompleted(): Promise<boolean> {
    const transaction = this.database.transaction("settings", "readonly");
    const done = transactionDone(transaction);
    const [setting] = await Promise.all([
      requestResult<boolean | undefined>(
        transaction.objectStore("settings").get("hideCompleted"),
      ),
      done,
    ]);
    return setting ?? false;
  }

  async saveHideCompleted(value: boolean): Promise<void> {
    const transaction = this.database.transaction("settings", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("settings").put(value, "hideCompleted");
    await done;
  }
}
