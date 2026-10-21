import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

/** Every error leaves as problem details JSON; unexpected ones become a generic 500. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === "object" && body !== null && "title" in body
            ? body
            : { title: exception.message, status },
        );
      return;
    }
    this.logger.error(exception);
    response.status(500).json({ title: "Server error", status: 500 });
  }
}
