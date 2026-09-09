import * as React from "react"
import { Dialog as DrawerPrimitive } from "radix-ui"

import { cn } from "./lib/cn"

/**
 * LIFT NOTE — upstream this file was built on `vaul`, which is not a dependency
 * of this workspace. It is now built on radix's Dialog (already a dependency,
 * and what vaul itself wraps). Every export keeps its name and props, and
 * `DrawerContent` still stamps `data-vaul-drawer-direction` on the sheet, so
 * every `data-[vaul-drawer-direction=…]` and
 * `group-data-[vaul-drawer-direction=…]` selector below — and in any consumer —
 * keeps matching unchanged.
 *
 * What is lost: vaul's DRAG. There is no swipe-to-dismiss and no rubber-banding
 * follow-the-finger sheet; open and close are CSS slide transitions. Escape,
 * outside-press, `DrawerClose` and focus trapping all still work, because those
 * were radix's to begin with.
 */

/**
 * How long the open/close transition runs.
 *
 * A surface whose *mount* is owned by something outside the drawer (a route,
 * say) has to wait this out before tearing itself down, or the sheet vanishes
 * instead of sliding away. `onAnimationEnd` can't be used for that: with a
 * controlled `open` prop the close animation only runs for closes the drawer
 * initiates itself (Escape, outside press, `DrawerClose`), never for an `open`
 * flip from the outside. Keeping the number here keeps that knowledge next to
 * the component instead of guessed at in a page.
 */
const DRAWER_TRANSITION_MS = 500

type Direction = "top" | "bottom" | "left" | "right"

const DirectionContext = React.createContext<Direction>("bottom")

function Drawer({
  direction = "bottom",
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { direction?: Direction }) {
  return (
    <DirectionContext.Provider value={direction}>
      <DrawerPrimitive.Root data-slot="drawer" {...props} />
    </DirectionContext.Provider>
  )
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/** The slide vaul used to drive by hand, as an entry/exit animation per edge. */
const SLIDE: Record<Direction, string> = {
  top: "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  bottom: "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
  left: "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  right: "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const direction = React.useContext(DirectionContext)
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        data-vaul-drawer-direction={direction}
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-background",
          "data-[state=closed]:animate-out data-[state=open]:animate-in",
          SLIDE[direction],
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[calc(100dvh*0.8)] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh*0.8)] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

/**
 * `DrawerContent` without the grabber or the direction-preset sizing — the
 * escape hatch for a surface that owns its own geometry (e.g. a near-fullscreen
 * detail panel). Keeps the drawer primitive confined to the kit so no page
 * layer imports it directly. `aria-describedby={undefined}` opts out of Radix's
 * "Dialog needs a description" warning: this surface's content is the
 * description.
 */
function DrawerBareContent({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const direction = React.useContext(DirectionContext)
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      data-vaul-drawer-direction={direction}
      aria-describedby={undefined}
      className={className}
      {...props}
    />
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  DRAWER_TRANSITION_MS,
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerBareContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
