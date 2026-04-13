import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createStudy, type CreateStudyPayload, type Study } from "../api/studies";
import { cn } from "../lib/utils";
import { studyOnboardingPath } from "../lib/routes";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type StudyFormProps = {
  className?: string;
  projectId: number;
};

const initialFormState: Omit<CreateStudyPayload, "project"> = { title: "" };

export function StudyForm({ className, projectId }: StudyFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formState, setFormState] = useState<Omit<CreateStudyPayload, "project">>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<Study, Error, CreateStudyPayload>({
    mutationFn: (payload: CreateStudyPayload) => createStudy(payload),
    onSuccess: (createdStudy) => {
      setFormState(initialFormState);
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      navigate(studyOnboardingPath(createdStudy.id), { replace: true });
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    mutation.mutate({
      project: projectId,
      ...formState,
    });
  }

  return (
    <Card className={className}>
      <CardHeader className="gap-3">
        <div className="grid gap-1">
          <p className="eyebrow">Launch</p>
          <CardTitle>Enter the onboarding wizard</CardTitle>
          <CardDescription>
            Create a draft study and continue into the wizard. Title is the only field needed here.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="study-title">Study title</Label>
            <Input
              id="study-title"
              required
              value={formState.title}
              onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              The wizard will collect the rest of the study details and metadata-driving fields.
            </p>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? "Starting..." : "Start onboarding"}
            </Button>
          </div>
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
