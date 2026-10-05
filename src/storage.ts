import type { SomedayList, Task } from "./model";

const databaseName = "yourweek";
const schemaVersion = 1;

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
        const tasks = database.createObjectStore("tasks", { keyPath: "id" });
        tasks.createIndex("date", "placement.date");
        const lists = database.createObjectStore("lists", { keyPath: "id" });
        ["Входящие", "Личное", "Идеи"].forEach((title, order) => {
          lists.add({ id: crypto.randomUUID(), title, order });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Закройте другие вкладки YourWeek и повторите"));
    });
    database.onversionchange = () => database.close();
    return new PlannerStorage(database);
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
}
