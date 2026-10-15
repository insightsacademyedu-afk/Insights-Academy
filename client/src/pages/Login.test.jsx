import { vi, test, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ login, status: "anonymous" }) }));
beforeEach(() => { login.mockReset(); login.mockResolvedValue({}); });

test("sub-admin submits its own login role", async () => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: "Sub-admin" }));
  await user.type(screen.getByLabelText("Username, email or phone number"), "reception");
  await user.type(screen.getByLabelText("Password", { selector: "input" }), "OfficePassword123!");
  await user.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await waitFor(() => expect(login).toHaveBeenCalledWith("reception", "OfficePassword123!", "subadmin"));
});

test("password recovery is only shown for the Admin option", async () => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  const user = userEvent.setup();
  expect(screen.getByRole("radio", { name: "Admin" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument();

  for (const role of ["Staff", "Parent"]) {
    await user.click(screen.getByRole("radio", { name: role }));
    expect(screen.getByRole("radio", { name: role })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Forgot password?" })).not.toBeInTheDocument();
  }

  await user.click(screen.getByRole("radio", { name: "Admin" }));
  await user.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect(screen.getByRole("heading", { name: "Reset password" })).toBeInTheDocument();
});

test.each(["teacher.one", "teacher@gmail.com", "+92 300 1234567"])("login submits %s with the password", async identifier => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username, email or phone number"), identifier);
  await user.type(screen.getByLabelText("Password", { selector: "input" }), "Password123!");
  await user.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await waitFor(() => expect(login).toHaveBeenCalledWith(identifier, "Password123!", "admin"));
});

test.each(["Staff", "Parent"])("login submits the selected %s option", async role => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: role }));
  await user.type(screen.getByLabelText("Username, email or phone number"), "member@example.com");
  await user.type(screen.getByLabelText("Password", { selector: "input" }), "Password123!");
  await user.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await waitFor(() => expect(login).toHaveBeenCalledWith("member@example.com", "Password123!", role.toLowerCase()));
});
