import React, { useMemo, useState } from 'react';
import type { SiteLocation } from '../../types';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { formatLocationFields, getEffectiveLabel, isDomesticLocation, safeText, locationHierarchyKeys } from '../../lib/locationFormat';

type HierarchyNode<T> = Map<string, HierarchyNode<T> | T[]>;

function compareMaybeNumeric(a: string, b: string): number {
  const an = Number(a);
  const bn = Number(b);
  const aNum = Number.isFinite(an) && a.trim() !== '';
  const bNum = Number.isFinite(bn) && b.trim() !== '';
  if (aNum && bNum) return an - bn;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortedKeys(map: Map<string, any>): string[] {
  return [...map.keys()].sort(compareMaybeNumeric);
}

function buildHierarchy(locations: SiteLocation[]): HierarchyNode<SiteLocation> {
  const root: HierarchyNode<SiteLocation> = new Map();

  for (const loc of locations) {
    const keys = locationHierarchyKeys(loc);

    const labelNode = (root.get(keys.label) as HierarchyNode<SiteLocation> | undefined) ?? new Map();
    root.set(keys.label, labelNode);

    const floorNode = (labelNode.get(keys.floor) as HierarchyNode<SiteLocation> | undefined) ?? new Map();
    labelNode.set(keys.floor, floorNode);

    const suiteNode = (floorNode.get(keys.suite) as HierarchyNode<SiteLocation> | undefined) ?? new Map();
    floorNode.set(keys.suite, suiteNode);

    const rowNode = (suiteNode.get(keys.row) as HierarchyNode<SiteLocation> | undefined) ?? new Map();
    suiteNode.set(keys.row, rowNode);

    const rackList = (rowNode.get(keys.rack) as SiteLocation[] | undefined) ?? [];
    rackList.push(loc);
    rowNode.set(keys.rack, rackList);
  }

  return root;
}

type DomesticHierarchy = Map<string, Map<string, Map<string, SiteLocation[]>>>; // label -> floor -> area -> locations

function buildDomesticHierarchy(locations: SiteLocation[]): DomesticHierarchy {
  const root: DomesticHierarchy = new Map();

  for (const loc of locations) {
    const labelKey = getEffectiveLabel(loc) || 'Site';
    const floorKey = safeText(loc.floor) || 'Unspecified';
    const areaKey = safeText((loc as any).area) || 'Unspecified';

    const labelNode = root.get(labelKey) ?? new Map();
    root.set(labelKey, labelNode);

    const floorNode = labelNode.get(floorKey) ?? new Map();
    labelNode.set(floorKey, floorNode);

    const list = floorNode.get(areaKey) ?? [];
    list.push(loc);
    floorNode.set(areaKey, list);
  }

  return root;
}

function sortedKeysPlain(map: Map<string, any>): string[] {
  return [...map.keys()].sort(compareMaybeNumeric);
}

export type LocationHierarchyScope = {
  label: string;
  floor?: string;
  suite?: string;
  row?: string;
  rack?: string;
  area?: string;
};

function formatScope(scope: LocationHierarchyScope): string {
  const parts: string[] = [scope.label];
  if (scope.floor !== undefined) parts.push(`Floor ${scope.floor}`);
  if (scope.area !== undefined) parts.push(`Area ${scope.area}`);
  if (scope.suite !== undefined) parts.push(`Suite ${scope.suite}`);
  if (scope.row !== undefined) parts.push(`Row ${scope.row}`);
  if (scope.rack !== undefined) parts.push(`Rack ${scope.rack}`);
  return parts.join(' / ');
}

type LocationSelectProps = {
  mode?: 'location';
  locations: SiteLocation[];
  valueLocationId: number | null;
  onSelect: (locationId: number) => void;
  placeholder: string;
  disabled?: boolean;
};

type ScopeSelectProps = {
  mode: 'scope';
  locations: SiteLocation[];
  valueScope: LocationHierarchyScope | null;
  onSelectScope: (scope: LocationHierarchyScope | null) => void;
  placeholder: string;
  disabled?: boolean;
};

export type LocationHierarchyDropdownProps = LocationSelectProps | ScopeSelectProps;

const LocationHierarchyDropdown: React.FC<LocationHierarchyDropdownProps> = (props) => {
  const [open, setOpen] = useState(false);

  const locations = props.locations;
  const disabled = props.disabled;
  const placeholder = props.placeholder;
  const isScopeMode = props.mode === 'scope';

  const valueLocationId = 'valueLocationId' in props ? props.valueLocationId : null;
  const valueScope = 'valueScope' in props ? props.valueScope : null;

  const selected = useMemo(() => {
    if (isScopeMode) return null;
    if (!valueLocationId) return null;
    return locations.find((l) => Number(l.id) === Number(valueLocationId)) ?? null;
  }, [isScopeMode, locations, valueLocationId]);

  const selectedScopeLabel = useMemo(() => {
    if (!isScopeMode) return null;
    return valueScope ? formatScope(valueScope) : null;
  }, [isScopeMode, valueScope]);

  const datacentreLocations = useMemo(
    () => locations.filter((l) => !isDomesticLocation(l)),
    [locations]
  );
  const domesticLocations = useMemo(
    () => locations.filter((l) => isDomesticLocation(l)),
    [locations]
  );

  const hierarchy = useMemo(() => buildHierarchy(datacentreLocations), [datacentreLocations]);
  const domesticHierarchy = useMemo(() => buildDomesticHierarchy(domesticLocations), [domesticLocations]);

  const labelKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const k of hierarchy.keys()) keys.add(k);
    for (const k of domesticHierarchy.keys()) keys.add(k);
    return [...keys].sort(compareMaybeNumeric);
  }, [hierarchy, domesticHierarchy]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between" disabled={disabled}>
          <span className="truncate text-left">
            {!isScopeMode
              ? selected
                ? formatLocationFields(selected)
                : placeholder
              : selectedScopeLabel ?? placeholder}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[28rem] max-w-[90vw]" align="start">
        <DropdownMenuLabel>{isScopeMode ? 'Select scope' : 'Select location'}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isScopeMode && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                props.onSelectScope(null);
                setOpen(false);
              }}
            >
              Any
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {labelKeys.map((labelKey) => {
          const floors = (hierarchy.get(labelKey) as HierarchyNode<SiteLocation> | undefined) ?? new Map();
          const domesticFloors = domesticHierarchy.get(labelKey);

          const unifiedFloorKeys = !isScopeMode
            ? (() => {
              const keys = new Set<string>();
              for (const k of floors.keys()) keys.add(k);
              if (domesticFloors) {
                for (const k of domesticFloors.keys()) keys.add(k);
              }
              return [...keys].sort(compareMaybeNumeric);
            })()
            : [];

          return (
            <DropdownMenuSub key={labelKey}>
              <DropdownMenuSubTrigger>{labelKey}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {isScopeMode && (
                  <DropdownMenuItem
                    onSelect={() => {
                      props.onSelectScope({ label: labelKey });
                      setOpen(false);
                    }}
                  >
                    {`Any in ${labelKey}`}
                  </DropdownMenuItem>
                )}

                {!isScopeMode && (
                  <>
                    {unifiedFloorKeys.map((floorKey) => {
                      const domesticAreas = domesticFloors?.get(floorKey);
                      const suites = floors.get(floorKey) as HierarchyNode<SiteLocation> | undefined;

                      return (
                        <DropdownMenuSub key={`${labelKey}::${floorKey}`}>
                          <DropdownMenuSubTrigger>{`Floor ${floorKey}`}</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {domesticAreas &&
                              sortedKeysPlain(domesticAreas).map((areaKey) => {
                                const locs = domesticAreas.get(areaKey) ?? [];
                                if (locs.length === 1) {
                                  const loc = locs[0]!;
                                  return (
                                    <DropdownMenuItem
                                      key={`DOMLOC::${labelKey}::${floorKey}::${areaKey}::${loc.id}`}
                                      onSelect={() => {
                                        props.onSelect(loc.id);
                                        setOpen(false);
                                      }}
                                    >
                                      {`Area ${areaKey}`}
                                    </DropdownMenuItem>
                                  );
                                }

                                return (
                                  <DropdownMenuSub key={`DOMLOC::${labelKey}::${floorKey}::${areaKey}`}>
                                    <DropdownMenuSubTrigger>{`Area ${areaKey}`}</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {locs
                                        .slice()
                                        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
                                        .map((loc) => (
                                          <DropdownMenuItem
                                            key={loc.id}
                                            onSelect={() => {
                                              props.onSelect(loc.id);
                                              setOpen(false);
                                            }}
                                          >
                                            {`Select (ID ${loc.id})`}
                                          </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                );
                              })}

                            {suites &&
                              sortedKeys(suites).map((suiteKey) => {
                                const rows = suites.get(suiteKey) as HierarchyNode<SiteLocation>;
                                return (
                                  <DropdownMenuSub key={`${labelKey}::${floorKey}::${suiteKey}`}>
                                    <DropdownMenuSubTrigger>{`Suite ${suiteKey}`}</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {sortedKeys(rows).map((rowKey) => {
                                        const racks = rows.get(rowKey) as HierarchyNode<SiteLocation>;
                                        return (
                                          <DropdownMenuSub key={`${labelKey}::${floorKey}::${suiteKey}::${rowKey}`}>
                                            <DropdownMenuSubTrigger>{`Row ${rowKey}`}</DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent>
                                              {sortedKeys(racks).map((rackKey) => {
                                                const locs = racks.get(rackKey) as SiteLocation[];
                                                return locs.length === 1 ? (
                                                  <DropdownMenuItem
                                                    key={`${labelKey}::${floorKey}::${suiteKey}::${rowKey}::${rackKey}::${locs[0]!.id}`}
                                                    onSelect={() => {
                                                      props.onSelect(locs[0]!.id);
                                                      setOpen(false);
                                                    }}
                                                  >
                                                    {`Rack ${rackKey}`}
                                                  </DropdownMenuItem>
                                                ) : (
                                                  <DropdownMenuSub key={`${labelKey}::${floorKey}::${suiteKey}::${rowKey}::${rackKey}`}>
                                                    <DropdownMenuSubTrigger>{`Rack ${rackKey}`}</DropdownMenuSubTrigger>
                                                    <DropdownMenuSubContent>
                                                      {locs
                                                        .slice()
                                                        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
                                                        .map((loc) => (
                                                          <DropdownMenuItem
                                                            key={loc.id}
                                                            onSelect={() => {
                                                              props.onSelect(loc.id);
                                                              setOpen(false);
                                                            }}
                                                          >
                                                            {`Select (ID ${loc.id})`}
                                                          </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuSubContent>
                                                  </DropdownMenuSub>
                                                );
                                              })}
                                            </DropdownMenuSubContent>
                                          </DropdownMenuSub>
                                        );
                                      })}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                );
                              })}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      );
                    })}
                  </>
                )}

                {isScopeMode && domesticFloors && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Domestic</DropdownMenuLabel>
                    {sortedKeysPlain(domesticFloors).map((floorKey) => {
                      const areas = domesticFloors.get(floorKey)!;
                      return (
                        <DropdownMenuSub key={`DOM::${labelKey}::${floorKey}`}>
                          <DropdownMenuSubTrigger>{`Floor ${floorKey}`}</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {isScopeMode && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  props.onSelectScope({ label: labelKey, floor: floorKey });
                                  setOpen(false);
                                }}
                              >
                                {`Any in Floor ${floorKey}`}
                              </DropdownMenuItem>
                            )}

                            {sortedKeysPlain(areas).map((areaKey) => {
                              return (
                                <DropdownMenuItem
                                  key={`DOMSCOPE::${labelKey}::${floorKey}::${areaKey}`}
                                  onSelect={() => {
                                    props.onSelectScope({ label: labelKey, floor: floorKey, area: areaKey });
                                    setOpen(false);
                                  }}
                                >
                                  {`Area ${areaKey}`}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Datacentre/Commercial</DropdownMenuLabel>
                  </>
                )}

                {isScopeMode && sortedKeys(floors).map((floorKey) => {
                  const suites = floors.get(floorKey) as HierarchyNode<SiteLocation>;
                  return (
                    <DropdownMenuSub key={`${labelKey}::${floorKey}`}>
                      <DropdownMenuSubTrigger>{`Floor ${floorKey}`}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {isScopeMode && (
                          <DropdownMenuItem
                            onSelect={() => {
                              props.onSelectScope({ label: labelKey, floor: floorKey });
                              setOpen(false);
                            }}
                          >
                            {`Any in Floor ${floorKey}`}
                          </DropdownMenuItem>
                        )}

                        {sortedKeys(suites).map((suiteKey) => {
                          const rows = suites.get(suiteKey) as HierarchyNode<SiteLocation>;
                          return (
                            <DropdownMenuSub key={`${labelKey}::${floorKey}::${suiteKey}`}>
                              <DropdownMenuSubTrigger>{`Suite ${suiteKey}`}</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {isScopeMode && (
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      props.onSelectScope({
                                        label: labelKey,
                                        floor: floorKey,
                                        suite: suiteKey,
                                      });
                                      setOpen(false);
                                    }}
                                  >
                                    {`Any in Suite ${suiteKey}`}
                                  </DropdownMenuItem>
                                )}

                                {sortedKeys(rows).map((rowKey) => {
                                  const racks = rows.get(rowKey) as HierarchyNode<SiteLocation>;
                                  return (
                                    <DropdownMenuSub key={`${labelKey}::${floorKey}::${suiteKey}::${rowKey}`}>
                                      <DropdownMenuSubTrigger>{`Row ${rowKey}`}</DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent>
                                        {isScopeMode && (
                                          <DropdownMenuItem
                                            onSelect={() => {
                                              props.onSelectScope({
                                                label: labelKey,
                                                floor: floorKey,
                                                suite: suiteKey,
                                                row: rowKey,
                                              });
                                              setOpen(false);
                                            }}
                                          >
                                            {`Any in Row ${rowKey}`}
                                          </DropdownMenuItem>
                                        )}

                                        {sortedKeys(racks).map((rackKey) => {
                                          return (
                                            <DropdownMenuItem
                                              key={`${labelKey}::${floorKey}::${suiteKey}::${rowKey}::${rackKey}`}
                                              onSelect={() => {
                                                props.onSelectScope({
                                                  label: labelKey,
                                                  floor: floorKey,
                                                  suite: suiteKey,
                                                  row: rowKey,
                                                  rack: rackKey,
                                                });
                                                setOpen(false);
                                              }}
                                            >
                                              {`Rack ${rackKey}`}
                                            </DropdownMenuItem>
                                          );
                                        })}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  );
                                })}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LocationHierarchyDropdown;
