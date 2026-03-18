interface ErrorWebviewMessage {
  status: "error";
  error: string;
  done: true;
}

interface SuccessWebviewSingleMessage<T> {
  done: true;
  status: "success";
  content: T;
}

type WebviewSingleMessage<T> =
  | ErrorWebviewMessage
  | SuccessWebviewSingleMessage<T>;

// Generators

type SuccessWebviewGeneratorMessage<T, R> =
  | {
      status: "success";
      done: false;
      content: T;
    }
  | {
      status: "success";
      done: true;
      content: R;
    };

type WebviewGeneratorMessage<T, R> =
  | SuccessWebviewGeneratorMessage<T, R>
  | ErrorWebviewMessage;
