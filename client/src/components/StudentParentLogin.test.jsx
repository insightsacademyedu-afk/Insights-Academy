import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentParentLogin from "./StudentParentLogin";
import { studentsApi } from "../api/students";
vi.mock("../api/students", () => ({ studentsApi: { parentLogin: vi.fn() } }));

describe('parent login controls on student records', () => {
  it('enables an existing student account without manually entering credentials', async () => {
    studentsApi.parentLogin.mockResolvedValue({ message: 'Parent login updated.' });
    const refreshed = vi.fn();
    render(<StudentParentLogin studentId="child1" onUpdated={refreshed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable parent login' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalled());
    expect(studentsApi.parentLogin).toHaveBeenCalledWith('child1', 'enable', undefined);
  });
  it('resets the selected family account with confirmation and refreshes its state', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    studentsApi.parentLogin.mockResolvedValue({ message: 'Password reset.' });
    const refreshed = vi.fn();
    render(<StudentParentLogin studentId="child2" accounts={[{ _id: 'parent1', phone: '923001234567', status: 'active' }]} onUpdated={refreshed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset parent password' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalled());
    expect(studentsApi.parentLogin).toHaveBeenCalledWith('child2', 'reset-password', 'parent1');
    expect(confirmation).toHaveBeenCalled();
    confirmation.mockRestore();
  });
});
